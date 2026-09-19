import { messages } from "@/messages";
import type { PnrOutcome, PnrResult } from "@/types/domain";
import { PNR_INVALID_MESSAGE, pnrSchema } from "@/utils/pnr";
import { CACHE_TTLS, type Cache } from "./cache";
import { AppError, fromSourceCode, toApiError, type ApiErrorBody } from "./errors";
import type { LiveBudget } from "./live-budget";
import type { PnrDataSource } from "./pnr-source";
import { PNR_RATE_LIMIT, addressKey, type RateLimiter } from "./rate-limit";
import { createPnrCache, createRateLimiter, liveBudget } from "./shared-store";
import { singleFlight } from "./single-flight";
import { getPnrSource } from "./sources";

// The one server-side PNR query: validate → rate limit → cache → daily budget → single flight
// → source. The API route calls this, so every check follows the same order.

/** A Refresh sooner than this after the record was retrieved is answered from the cache. */
export const REFRESH_MIN_AGE_MS = 30_000;

export interface RateInfo {
  readonly remaining: number;
  readonly limit: number;
}

export type PnrQueryOutcome =
  | {
      readonly ok: true;
      readonly result: PnrResult;
      readonly cached: boolean;
      readonly latencyMs: number;
      readonly rate: RateInfo;
    }
  | { readonly ok: false; readonly error: ApiErrorBody; readonly rate?: RateInfo };

export interface PnrQueryDeps {
  readonly source: PnrDataSource;
  readonly limiter: RateLimiter;
  readonly cache: Cache;
  /** Live requests left today, across every address. */
  readonly budget: LiveBudget;
  readonly now: () => number;
  /** Shares one provider call between concurrent checks of the same PNR on this instance. */
  readonly flight: (pnr: string, run: () => Promise<PnrOutcome>) => Promise<PnrOutcome>;
}

export interface PnrQueryOptions {
  /** An explicit Refresh: asks the source again, unless the record is younger than REFRESH_MIN_AGE_MS or today's budget is spent. */
  readonly fresh?: boolean;
  readonly deps?: Partial<PnrQueryDeps>;
}

let shared: Pick<PnrQueryDeps, "limiter" | "cache" | "flight" | "budget"> | null = null;

function defaultDeps(): PnrQueryDeps {
  shared ??= { limiter: createRateLimiter(), cache: createPnrCache(), flight: singleFlight<PnrOutcome>(), budget: liveBudget() };
  return { source: getPnrSource(), ...shared, now: Date.now };
}

/** How long ago the source returned this record; unreadable times count as old. */
function ageMs(result: PnrResult, now: number): number {
  const at = Date.parse(result.checkedAt);
  return Number.isNaN(at) ? Infinity : now - at;
}

export async function queryPnr(pnr: string, ip: string, options: PnrQueryOptions = {}): Promise<PnrQueryOutcome> {
  const deps: PnrQueryDeps = { ...defaultDeps(), ...options.deps };
  const started = deps.now();

  const parsed = pnrSchema.safeParse(pnr);
  if (!parsed.success) {
    return { ok: false, error: toApiError(new AppError("INVALID_INPUT", PNR_INVALID_MESSAGE)) };
  }

  const rate = await deps.limiter.check(`pnr:${addressKey(ip)}`, PNR_RATE_LIMIT.limit, PNR_RATE_LIMIT.windowMs);
  const rateInfo: RateInfo = { remaining: rate.remaining, limit: PNR_RATE_LIMIT.limit };
  if (!rate.ok) {
    return {
      ok: false,
      error: toApiError(
        new AppError("RATE_LIMITED", "Too many checks from this connection. Wait a moment and retry.", {
          retryAfter: rate.retryAfterSeconds,
        }),
      ),
      rate: rateInfo,
    };
  }

  const key = parsed.data;
  const served = (result: PnrResult, cached: boolean): PnrQueryOutcome => ({ ok: true, result, cached, latencyMs: deps.now() - started, rate: rateInfo });

  // The cache holds successful records only.
  const hit = await deps.cache.get<PnrOutcome>(key);
  const held = hit?.ok ? hit.result : undefined;
  if (held && (!options.fresh || ageMs(held, deps.now()) < REFRESH_MIN_AGE_MS)) return served(held, true);

  // Past today's budget no provider is asked: the record already held, or an honest refusal.
  const allowance = await deps.budget.take();
  if (!allowance.ok) {
    if (held) return served(held, true);
    const refusal = new AppError("SOURCE_UNAVAILABLE", messages.source.outcomes.dailyLimit, { retryAfter: allowance.retryAfterSeconds });
    return { ok: false, error: toApiError(refusal), rate: rateInfo };
  }

  const outcome = await deps.flight(key, () => deps.source.check(key));
  if (!outcome.ok) {
    return { ok: false, error: toApiError(fromSourceCode(outcome.code, outcome.message)), rate: rateInfo };
  }
  await deps.cache.set(key, outcome, CACHE_TTLS.snapshot);
  return served(outcome.result, false);
}
