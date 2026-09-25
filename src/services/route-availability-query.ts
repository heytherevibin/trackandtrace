import type { AvailabilityAnswer, AvailabilityRequest, AvailabilitySource } from "./availability-source";
import type { LiveBudget } from "./live-budget";
import { log } from "./log";
import { recordObservations } from "./observations";
import { addressKey, type RateLimiter } from "./rate-limit";
import { leadClassOf, type RouteAvailabilityAnswer, type RouteAvailabilityRequest, type TrainRow } from "./route-availability";
import { queryRoute } from "./route-query";
import type { RouteOutcome, RouteTrain } from "./route-source";
import { createRateLimiter, liveBudget } from "./shared-store";
import { getAvailabilitySource } from "./sources";
import type { SourceFailure } from "./sources/outcome";
import { messages } from "@/messages";
import type { BookingClass } from "@/types/domain";
import { bookingClassSchema } from "@/types/schemas";

// ---------------------------------------------------------------------------
// One search of a whole route: the trains on a pair, then the first chosen class
// for each of them.
//
// Availability exists only per train PER CLASS, so a row with no class asked is
// a timetable entry and not an answer. The lead class is therefore asked for
// every train, and the rest wait until a row is opened: nine requests for a
// search of eight trains instead of twenty-five, and two more per row opened.
//
// It pays the rate limit and the budget ONCE, at the search, and then calls the
// availability SOURCE directly. Looping `queryAvailability` would take the
// per-ask limit and one budget unit per train — double-counting exactly what
// this design removes. That looks like duplication and is not.
//
// The rule it inherits from both seams underneath: **a refusal is never an empty
// list.** `trains: []` is an answer about the railway and comes back ok; a
// search that could not be made carries no rows at all.
// ---------------------------------------------------------------------------

/** Six searches a minute: generous for a reader, hostile to a script. */
export const ROUTE_AVAILABILITY_RATE_LIMIT = { limit: 6, windowMs: 60_000 };

/**
 * A long pair returns far more trains than a reader will look at, and an uncapped
 * fan-out is an outbound stampede on one click. Trains past the cap are still
 * LISTED — the cap changes what was asked, not what runs.
 */
export const ROUTE_AVAILABILITY_MAX_TRAINS = 12;

/** Enough to hide the latency of a dozen asks, few enough not to look like an attack. */
const CONCURRENCY = 4;

export interface RouteAvailabilityQueryDeps {
  readonly limiter: RateLimiter;
  readonly budget: LiveBudget;
  readonly source: AvailabilitySource;
  /** The route lookup, injected so a test can answer without a limiter of its own. */
  readonly route: (from: string, to: string, ip: string) => Promise<RouteOutcome>;
  /** Recording is fire-and-forget; injected so a test can await it. */
  readonly record: (request: AvailabilityRequest, answer: AvailabilityAnswer) => Promise<unknown>;
}

let shared: Pick<RouteAvailabilityQueryDeps, "limiter" | "budget"> | null = null;

function deps(): RouteAvailabilityQueryDeps {
  shared ??= { limiter: createRateLimiter(), budget: liveBudget() };
  return {
    ...shared,
    source: getAvailabilitySource(),
    route: async (from, to, ip) => (await queryRoute(from, to, ip)).outcome,
    record: recordObservations,
  };
}

export type RouteAvailabilityOutcome = { readonly ok: true; readonly answer: RouteAvailabilityAnswer } | SourceFailure;

export interface RouteAvailabilityQueryResult {
  readonly outcome: RouteAvailabilityOutcome;
  readonly remaining: number;
}

/** Runs `work` over `items`, at most `limit` at a time, keeping the input order. */
async function pooled<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next; i < items.length; i = next) {
      next = i + 1;
      out[i] = await work(items[i]!);
    }
  });
  await Promise.all(runners);
  return out;
}

/** The chosen classes in the enum's order, so the lead and the queue behind it are stable. */
function ordered(chosen: readonly BookingClass[]): readonly BookingClass[] {
  return bookingClassSchema.options.filter((cls) => chosen.includes(cls));
}

export async function queryRouteAvailability(
  request: RouteAvailabilityRequest,
  ip: string,
  overrides: Partial<RouteAvailabilityQueryDeps> = {},
): Promise<RouteAvailabilityQueryResult> {
  const { limiter, budget, source, route, record } = { ...deps(), ...overrides };
  const chosen = ordered(request.classes);
  const lead = leadClassOf(request.classes, bookingClassSchema.options);
  if (!lead) {
    return { outcome: { ok: false, code: "INVALID", message: messages.source.availability.invalidRequest }, remaining: 0 };
  }

  const rate = await limiter.check(`routeAvailability:${addressKey(ip)}`, ROUTE_AVAILABILITY_RATE_LIMIT.limit, ROUTE_AVAILABILITY_RATE_LIMIT.windowMs);
  if (!rate.ok) {
    return {
      outcome: { ok: false, code: "RATE_LIMITED", message: messages.states.rateLimited.detail, retryAfter: rate.retryAfterSeconds },
      remaining: rate.remaining,
    };
  }

  const found = await route(request.from, request.to, ip);
  if (!found.ok) return { outcome: found, remaining: rate.remaining };

  const trains = found.answer.trains;
  const asking = trains.slice(0, ROUTE_AVAILABILITY_MAX_TRAINS);

  // Nothing is reserved and nothing is asked for a pair with no trains — and that is still an
  // answer, not a refusal.
  if (asking.length > 0) {
    const allowance = await budget.takeMany(asking.length);
    if (!allowance.ok) {
      return {
        outcome: { ok: false, code: "SOURCE_UNAVAILABLE", message: messages.source.outcomes.dailyLimit, retryAfter: allowance.retryAfterSeconds },
        remaining: rate.remaining,
      };
    }
  }

  const rest = chosen.filter((cls) => cls !== lead);

  const asked = await pooled(asking, CONCURRENCY, async (train): Promise<TrainRow> => {
    // The stations THAT TRAIN calls at, not the pair the traveller typed.
    //
    // "Bengaluru to Delhi" is served from SBC and from YPR, and arrives at NDLS, NZM, DEE or TKD.
    // Production answers SBC → NDLS with eight trains of which SEVEN call at neither of those two
    // stations, and asking them about SBC → NDLS refuses for all seven. `RouteTrain.fromCode` and
    // `toCode` are that train's own segment on this pair, which is exactly what must be asked.
    const ask: AvailabilityRequest = {
      trainNo: train.trainNo,
      from: train.fromCode,
      to: train.toCode,
      journeyDate: request.journeyDate,
      travelClass: lead,
      quota: request.quota,
    };
    const outcome = await source.check(ask).catch((error: unknown) => {
      log.warn("[route-availability] a train's ask threw", { kind: error instanceof Error ? error.name : typeof error });
      // A throw is a failure, never a wrong question. It carries the taxonomy's own shape so the
      // branch below reads one type rather than two.
      return { ok: false, code: "SOURCE_UNAVAILABLE", message: messages.source.availability.couldNotAnswer, cause: "network" } satisfies SourceFailure;
    });
    if (!outcome.ok) {
      // INVALID is a wrong question the provider answered, not a provider that could not answer —
      // the breaker ignores it for the same reason. "Does not carry that class" is the one we can
      // name, and it belongs to the train, so it is neither pending nor failed: asking again can
      // only be refused the same way.
      if (outcome.code === "INVALID" && outcome.message === messages.source.availability.classNotCarried) {
        return { train, answers: {}, pending: rest, notCarried: [lead], beyondCap: false, failed: false };
      }
      // Anything else: the class goes back in the queue so opening the row can ask it again.
      // Dropping it would lose the lead class with no way to retry.
      return { train, answers: {}, pending: chosen, notCarried: [], beyondCap: false, failed: true };
    }
    void Promise.resolve(record(ask, outcome.answer)).catch((error: unknown) => {
      log.warn("[route-availability] an answer was served but not recorded", { kind: error instanceof Error ? error.name : typeof error });
    });
    return { train, answers: { [lead]: outcome.answer }, pending: rest, notCarried: [], beyondCap: false, failed: false };
  });

  const beyond: TrainRow[] = trains.slice(ROUTE_AVAILABILITY_MAX_TRAINS).map((train: RouteTrain) => ({
    train,
    answers: {},
    pending: chosen,
    notCarried: [],
    beyondCap: true,
    failed: false,
  }));

  return {
    outcome: {
      ok: true,
      answer: {
        from: request.from,
        to: request.to,
        journeyDate: request.journeyDate,
        leadClass: lead,
        rows: [...asked, ...beyond],
        retrievedAt: found.answer.retrievedAt,
      },
    },
    remaining: rate.remaining,
  };
}
