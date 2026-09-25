import { messages } from "@/messages";
import type { RouteOutcome, RouteSource } from "./route-source";
import { addressKey, type RateLimiter } from "./rate-limit";
import { createRateLimiter } from "./shared-store";
import { getRouteSource } from "./sources";

// ---------------------------------------------------------------------------
// One ask for the trains on a route, with the limiter in front of it — the thin
// sibling of `pnr-query.ts`. There is no cache here yet and no daily budget:
// this endpoint is reached once per station pair a traveller types, and the
// provider's own breaker and usage counter already sit under it. A cache is the
// obvious next thing (routes barely change), and it is deliberately not smuggled
// into the same change as the seam.
//
// The limiter is stricter per minute than the PNR one because a route ask costs
// a provider request and, unlike a PNR, a traveller can produce them by typing.
// ---------------------------------------------------------------------------

export const ROUTE_RATE_LIMIT = { limit: 12, windowMs: 60_000 };

export interface RouteQueryDeps {
  readonly limiter: RateLimiter;
  readonly source: RouteSource;
}

let shared: Pick<RouteQueryDeps, "limiter"> | null = null;

function deps(): RouteQueryDeps {
  shared ??= { limiter: createRateLimiter() };
  return { ...shared, source: getRouteSource() };
}

export interface RouteQueryResult {
  readonly outcome: RouteOutcome;
  readonly remaining: number;
}

/** Rate-limited by caller address, then asked. A limited caller costs the provider nothing. */
export async function queryRoute(from: string, to: string, ip: string, overrides: Partial<RouteQueryDeps> = {}): Promise<RouteQueryResult> {
  const { limiter, source } = { ...deps(), ...overrides };
  const rate = await limiter.check(`route:${addressKey(ip)}`, ROUTE_RATE_LIMIT.limit, ROUTE_RATE_LIMIT.windowMs);
  if (!rate.ok) {
    return {
      outcome: { ok: false, code: "RATE_LIMITED", message: messages.states.rateLimited.detail, retryAfter: rate.retryAfterSeconds },
      remaining: rate.remaining,
    };
  }
  return { outcome: await source.check({ from, to }), remaining: rate.remaining };
}
