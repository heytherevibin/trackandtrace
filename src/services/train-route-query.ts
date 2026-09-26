import { messages } from "@/messages";
import type { Kv } from "./kv";
import { log } from "./log";
import { addressKey, type RateLimiter } from "./rate-limit";
import { createRateLimiter, publicStore } from "./shared-store";
import { getTrainRouteSource } from "./sources";
import type { TrainRouteAnswer, TrainRouteOutcome, TrainRouteSource } from "./train-route-source";

// ---------------------------------------------------------------------------
// One train's run, rate-limited and CACHED.
//
// The cache is the whole reason this feature is affordable. Asking costs one
// provider request per train, and a search lists up to twelve — so the run is
// never fetched for a list, only for the train a reader opened, and the answer
// is then held long enough that the next reader of that train costs nothing.
//
// **A timetable is not a live reading.** It changes a few times a year, which is
// what justifies a day-long hold; availability, which changes by the minute, is
// cached for sixty seconds and must never borrow this number.
//
// Nothing here is personal: a train number and its stations. The value goes in
// the PLAIN shared store, not the encrypted PNR cache.
// ---------------------------------------------------------------------------

/** A reader asking for several trains' runs in a row is normal; a script walking the timetable is not. */
export const TRAIN_ROUTE_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

/** One day. Long enough that a popular train is fetched once for everyone, short enough that a timetable revision lands within a day. */
export const TRAIN_ROUTE_TTL_MS = 86_400_000;

export interface TrainRouteQueryDeps {
  readonly limiter: RateLimiter;
  readonly source: TrainRouteSource;
  readonly kv: Kv;
  readonly prefix: string;
}

let shared: Pick<TrainRouteQueryDeps, "limiter"> | null = null;

function deps(): TrainRouteQueryDeps {
  shared ??= { limiter: createRateLimiter() };
  const store = publicStore();
  return { ...shared, source: getTrainRouteSource(), kv: store.kv, prefix: store.prefix };
}

export interface TrainRouteQueryResult {
  readonly outcome: TrainRouteOutcome;
  readonly remaining: number;
  /** Whether the answer came from the store rather than the provider. The page says so. */
  readonly cached: boolean;
}

/** An answer read back from the store, or undefined when it is absent or unreadable. */
function fromJson(raw: string | null): TrainRouteAnswer | undefined {
  if (raw === null) return undefined;
  try {
    const value = JSON.parse(raw) as TrainRouteAnswer;
    // A cached shape that lost its stops would draw a train calling nowhere — the one thing this
    // seam must never produce. Treated as a miss, not as an answer.
    return Array.isArray(value.stops) && value.stops.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function queryTrainRoute(trainNo: string, ip: string, overrides: Partial<TrainRouteQueryDeps> = {}): Promise<TrainRouteQueryResult> {
  const { limiter, source, kv, prefix } = { ...deps(), ...overrides };
  const asked = trainNo.trim();
  const key = `${prefix}:trainroute:${asked}`;

  // The store is read BEFORE the limiter: a cached run costs the provider nothing, so refusing it
  // would ration something that is free. The limiter guards the provider, not the answer.
  const hit = await kv.get(key).then(fromJson, (error: unknown) => {
    log.warn("[train-route] cache read failed", { kind: error instanceof Error ? error.name : typeof error });
    return undefined;
  });
  if (hit) return { outcome: { ok: true, answer: hit }, remaining: TRAIN_ROUTE_RATE_LIMIT.limit, cached: true };

  const rate = await limiter.check(`trainRoute:${addressKey(ip)}`, TRAIN_ROUTE_RATE_LIMIT.limit, TRAIN_ROUTE_RATE_LIMIT.windowMs);
  if (!rate.ok) {
    return {
      outcome: { ok: false, code: "RATE_LIMITED", message: messages.states.rateLimited.detail, retryAfter: rate.retryAfterSeconds },
      remaining: rate.remaining,
      cached: false,
    };
  }

  const outcome = await source.check({ trainNo: asked });
  // Only an answer is kept. Caching a refusal would hold an outage for a day.
  if (outcome.ok) {
    void Promise.resolve(kv.set(key, JSON.stringify(outcome.answer), TRAIN_ROUTE_TTL_MS)).catch((error: unknown) => {
      log.warn("[train-route] answer served but not cached", { kind: error instanceof Error ? error.name : typeof error });
    });
  }
  return { outcome, remaining: rate.remaining, cached: false };
}
