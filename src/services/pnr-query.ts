import type { PnrResult } from "@/types/domain";
import { PNR_INVALID_MESSAGE, pnrSchema } from "@/utils/pnr";
import { CACHE_TTLS, getOrCompute, pnrCache, type Cache } from "./cache";
import { AppError, fromSourceCode, toApiError, type ApiErrorBody } from "./errors";
import type { PnrDataSource } from "./pnr-source";
import { PNR_RATE_LIMIT, type RateLimiter } from "./rate-limit";
import { createRateLimiter } from "./shared-store";
import { getPnrSource } from "./sources";

// The one server-side PNR query. The API route and the server-rendered result
// page both call this, so validation, rate limiting, caching, and provider
// selection live in exactly one place.

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
  readonly now: () => number;
}

export interface PnrQueryOptions {
  /** Skip the read-through cache (explicit Refresh). Still rate limited. */
  readonly fresh?: boolean;
  readonly deps?: Partial<PnrQueryDeps>;
}

let sharedLimiter: RateLimiter | null = null;

function defaultDeps(): PnrQueryDeps {
  sharedLimiter ??= createRateLimiter();
  return { source: getPnrSource(), limiter: sharedLimiter, cache: pnrCache, now: Date.now };
}

export async function queryPnr(pnr: string, ip: string, options: PnrQueryOptions = {}): Promise<PnrQueryOutcome> {
  const deps: PnrQueryDeps = { ...defaultDeps(), ...options.deps };
  const started = deps.now();

  const parsed = pnrSchema.safeParse(pnr);
  if (!parsed.success) {
    return { ok: false, error: toApiError(new AppError("INVALID_INPUT", PNR_INVALID_MESSAGE)) };
  }

  const rate = await deps.limiter.check(`pnr:${ip}`, PNR_RATE_LIMIT.limit, PNR_RATE_LIMIT.windowMs);
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

  const key = `pnr:${parsed.data}`;
  if (options.fresh) await deps.cache.delete(key);
  const { value: outcome, cached } = await getOrCompute(
    deps.cache,
    key,
    CACHE_TTLS.snapshot,
    () => deps.source.check(parsed.data),
    (value) => value.ok,
  );

  if (!outcome.ok) {
    return { ok: false, error: toApiError(fromSourceCode(outcome.code, outcome.message)), rate: rateInfo };
  }
  return { ok: true, result: outcome.result, cached, latencyMs: deps.now() - started, rate: rateInfo };
}
