import { messages } from "@/messages";
import type { AvailabilityAnswer, AvailabilityOutcome, AvailabilityRequest, AvailabilitySource } from "./availability-source";
import type { LiveBudget } from "./live-budget";
import { log } from "./log";
import { recordObservations } from "./observations";
import { addressKey, type RateLimiter } from "./rate-limit";
import { createRateLimiter, liveBudget } from "./shared-store";
import { getAvailabilitySource } from "./sources";

// ---------------------------------------------------------------------------
// One live availability ask: rate limit → daily budget → source → record.
//
// It is deliberately NOT cached. The PNR path caches because a record is stable
// for a minute; availability is the number a traveller is about to act on, and
// the page promises it is read at the moment of the request (spec D3). The
// budget is the thing that stops a busy day, not a cache that would answer with
// yesterday's berths.
//
// Every successful ask is also an observation (spec D6): a free data point for
// the model the crawler is collecting for. It is recorded after the answer is
// already in hand and never in the traveller's way — a store that is down must
// not cost anyone their answer.
// ---------------------------------------------------------------------------

export const AVAILABILITY_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

/**
 * Opening a row in the route list. Thirty a minute is eight rows of two classes each, opened back
 * to back, with room to spare — a reader working down a list never waits, and a script still
 * cannot turn one address into a crawler.
 */
export const CLASS_EXPAND_RATE_LIMIT = { limit: 30, windowMs: 60_000 };

export interface AvailabilityQueryDeps {
  readonly limiter: RateLimiter;
  readonly budget: LiveBudget;
  readonly source: AvailabilitySource;
  /** Recording is fire-and-forget; injected so a test can await it. */
  readonly record: (request: AvailabilityRequest, answer: Parameters<typeof recordObservations>[1]) => Promise<unknown>;
}

let shared: Pick<AvailabilityQueryDeps, "limiter" | "budget"> | null = null;

function deps(): AvailabilityQueryDeps {
  shared ??= { limiter: createRateLimiter(), budget: liveBudget() };
  return { ...shared, source: getAvailabilitySource(), record: recordObservations };
}

export interface AvailabilityQueryResult {
  readonly outcome: AvailabilityOutcome;
  readonly remaining: number;
}

export async function queryAvailability(request: AvailabilityRequest, ip: string, overrides: Partial<AvailabilityQueryDeps> = {}): Promise<AvailabilityQueryResult> {
  const { limiter, budget, source, record } = { ...deps(), ...overrides };

  const rate = await limiter.check(`availability:${addressKey(ip)}`, AVAILABILITY_RATE_LIMIT.limit, AVAILABILITY_RATE_LIMIT.windowMs);
  if (!rate.ok) {
    return {
      outcome: { ok: false, code: "RATE_LIMITED", message: messages.states.rateLimited.detail, retryAfter: rate.retryAfterSeconds },
      remaining: rate.remaining,
    };
  }

  // Past today's budget nothing is asked. There is no held answer to fall back on here, so this is
  // an honest refusal — which is still not an empty day list.
  const allowance = await budget.take();
  if (!allowance.ok) {
    return {
      outcome: { ok: false, code: "SOURCE_UNAVAILABLE", message: messages.source.outcomes.dailyLimit, retryAfter: allowance.retryAfterSeconds },
      remaining: rate.remaining,
    };
  }

  const outcome = await source.check(request);
  if (outcome.ok) {
    void Promise.resolve(record(request, outcome.answer)).catch((error: unknown) => {
      log.warn("[availability] an answer was served but not recorded", { kind: error instanceof Error ? error.name : typeof error });
    });
  }
  return { outcome, remaining: rate.remaining };
}

/** One train, several classes: what a row being opened asks for. */
export interface ClassExpandResult {
  readonly outcome: { readonly ok: true } | Extract<AvailabilityOutcome, { ok: false }>;
  readonly answers: Readonly<Record<string, AvailabilityAnswer>>;
  /** Classes that were asked and could not be answered — named, never left as an absence. */
  readonly failedClasses: readonly string[];
  readonly remaining: number;
}

/**
 * Opens a row: the classes the search named but did not ask.
 *
 * It pays the limit and the budget ONCE for the whole expand, then calls the source per class.
 * Looping `queryAvailability` would take the per-ask limit and a budget unit each time — the same
 * double-counting the route fan-out exists to remove.
 *
 * A class that fails does not cost the others their answer, and is NAMED in `failedClasses` rather
 * than left out: an absent class on this surface reads as "not carried", which is a different fact
 * about the train and not about the request.
 */
export async function queryAvailabilityClasses(
  journey: Omit<AvailabilityRequest, "travelClass">,
  classes: readonly string[],
  ip: string,
  overrides: Partial<AvailabilityQueryDeps> = {},
): Promise<ClassExpandResult> {
  const { limiter, budget, source, record } = { ...deps(), ...overrides };

  const rate = await limiter.check(`availabilityClasses:${addressKey(ip)}`, CLASS_EXPAND_RATE_LIMIT.limit, CLASS_EXPAND_RATE_LIMIT.windowMs);
  if (!rate.ok) {
    return {
      outcome: { ok: false, code: "RATE_LIMITED", message: messages.states.rateLimited.detail, retryAfter: rate.retryAfterSeconds },
      answers: {},
      failedClasses: [],
      remaining: rate.remaining,
    };
  }

  const allowance = await budget.takeMany(classes.length);
  if (!allowance.ok) {
    return {
      outcome: { ok: false, code: "SOURCE_UNAVAILABLE", message: messages.source.outcomes.dailyLimit, retryAfter: allowance.retryAfterSeconds },
      answers: {},
      failedClasses: [],
      remaining: rate.remaining,
    };
  }

  const answers: Record<string, AvailabilityAnswer> = {};
  const failedClasses: string[] = [];
  for (const travelClass of classes) {
    const request: AvailabilityRequest = { ...journey, travelClass };
    const outcome = await source.check(request);
    if (!outcome.ok) {
      failedClasses.push(travelClass);
      continue;
    }
    answers[travelClass] = outcome.answer;
    void Promise.resolve(record(request, outcome.answer)).catch((error: unknown) => {
      log.warn("[availability] an answer was served but not recorded", { kind: error instanceof Error ? error.name : typeof error });
    });
  }
  return { outcome: { ok: true }, answers, failedClasses, remaining: rate.remaining };
}
