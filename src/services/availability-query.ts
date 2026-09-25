import { messages } from "@/messages";
import type { AvailabilityOutcome, AvailabilityRequest, AvailabilitySource } from "./availability-source";
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
