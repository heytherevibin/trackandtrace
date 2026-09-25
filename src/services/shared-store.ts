import { createBreaker } from "./breaker";
import { pnrCache, type Cache } from "./cache";
import { deriveDataKeys, keyedHash } from "./data-key";
import { activePnrSource, env, isThirdPartySource, liveRequestsPerDay, sharedStoreConfig, type Env, type ThirdPartySource } from "./env";
import { MemoryKv, redisKv, resilientKv, type Kv } from "./kv";
import { UNLIMITED_BUDGET, createLiveBudget, type LiveBudget } from "./live-budget";
import { log } from "./log";
import { MemoryRateLimiter, SharedRateLimiter, type RateLimiter } from "./rate-limit";
import { EncryptedRedisCache } from "./redis-cache";
import type { GuardDeps } from "./sources/guarded";
import { connectRedis, upstashWindows } from "./upstash";
import { createUsageCounter } from "./usage";

// Builds the shared store once per environment: the encrypted PNR cache, the shared
// limiter, and each provider's breaker and usage counts, over one Upstash database.
// Without it, all of them stay in this instance.

const CACHE_TIMEOUT_MS = 500;
const LIMITER_TIMEOUT_MS = 1000;
const STATE_TIMEOUT_MS = 500;
const REPORT_EVERY_MS = 60_000;

interface SharedStore {
  readonly cache: Cache;
  readonly limiter: RateLimiter;
}

const stores = new WeakMap<Env, SharedStore | null>();
const states = new WeakMap<Env, { readonly kv: Kv; readonly prefix: string }>();
const guards = new WeakMap<Env, Map<string, GuardDeps>>();
const budgets = new WeakMap<Env, LiveBudget>();
/** Breaker state and usage counts without a shared store, and while it is down. */
const localKv = new MemoryKv();
const lastReport = new Map<string, number>();

/** At most once a minute per kind, and only the error's name: messages can carry keys. */
function report(kind: string, error?: unknown): void {
  const now = Date.now();
  if ((lastReport.get(kind) ?? -Infinity) > now - REPORT_EVERY_MS) return;
  lastReport.set(kind, now);
  log.warn(`[store] ${kind}: answered from this instance`, error instanceof Error ? error.name : "");
}

function build(current: Env): SharedStore | null {
  const config = sharedStoreConfig(current);
  if (!config) return null;
  const keys = deriveDataKeys(config.dataKey);
  return {
    cache: new EncryptedRedisCache({
      redis: connectRedis(config.credentials, CACHE_TIMEOUT_MS),
      keys,
      namespace: `${config.prefix}:pnr:v1`,
      onError: (error) => report("cache", error),
    }),
    limiter: new SharedRateLimiter({
      windows: upstashWindows(connectRedis(config.credentials, LIMITER_TIMEOUT_MS), config.prefix, LIMITER_TIMEOUT_MS),
      identify: (key) => keyedHash(keys.clientId, key),
      fallback: new MemoryRateLimiter(),
      onFallback: (reason) => report(`limiter ${reason}`),
    }),
  };
}

function store(current: Env): SharedStore | null {
  if (!stores.has(current)) stores.set(current, build(current));
  return stores.get(current) ?? null;
}

export function createRateLimiter(current: Env = env()): RateLimiter {
  return store(current)?.limiter ?? new MemoryRateLimiter();
}

export function createPnrCache(current: Env = env()): Cache {
  return store(current)?.cache ?? pnrCache;
}

function stateStore(current: Env): { readonly kv: Kv; readonly prefix: string } {
  const known = states.get(current);
  if (known) return known;
  const config = sharedStoreConfig(current);
  const made = config
    ? { kv: resilientKv(redisKv(connectRedis(config.credentials, STATE_TIMEOUT_MS)), localKv, (error) => report("breaker state", error)), prefix: config.prefix }
    : { kv: localKv, prefix: `tt:${current.VERCEL_ENV ?? current.NODE_ENV}` };
  states.set(current, made);
  return made;
}

/** Test seam: forget this instance's breaker state and usage counts. */
export function resetLocalState(): void {
  localKv.clear();
}

/** Today's live-request budget, shared by every instance. Sources that spend no provider quota have none. */
export function liveBudget(current: Env = env()): LiveBudget {
  if (!isThirdPartySource(activePnrSource(current))) return UNLIMITED_BUDGET;
  const known = budgets.get(current);
  if (known) return known;
  const { kv, prefix } = stateStore(current);
  const made = createLiveBudget({
    kv,
    prefix,
    limit: () => liveRequestsPerDay(current),
    onReached: ({ day, limit }) => log.warn("[budget] today's live-request budget is spent; answering from the cache until 00:00 IST", { day, limit }),
  });
  budgets.set(current, made);
  return made;
}

/**
 * Which caller of a provider is asking. They fail for different reasons — a
 * route crawler's refusals are mostly its own wrong questions — so each gets its
 * own breaker, over one shared provider-wide fuse for a refused key or a spent
 * plan. See `breaker.ts`.
 */
export type GuardEndpoint = "pnr" | "availability" | "route";

/** One breaker per provider *and caller*, one usage counter per provider, shared by every check in this environment. */
export function providerGuard(source: ThirdPartySource, endpoint: GuardEndpoint, current: Env = env()): GuardDeps {
  const perEnv = guards.get(current) ?? new Map<string, GuardDeps>();
  guards.set(current, perEnv);
  const caller = `${source}:${endpoint}`;
  const known = perEnv.get(caller);
  if (known) return known;
  const { kv, prefix } = stateStore(current);
  const count = createUsageCounter(kv, prefix);
  const made: GuardDeps = {
    breaker: createBreaker(
      kv,
      // The provider base is the key this product has always used; adding a caller segment to it
      // gives each caller its own four keys without moving anyone else's.
      { provider: `${prefix}:breaker:${source}`, endpoint: `${prefix}:breaker:${caller}` },
      {
        onChange: (event) =>
          log.warn(
            `[source:${caller}] breaker ${event.state}`,
            event.state === "open" ? { seconds: event.openMs / 1000, reason: event.reason, rests: event.scope } : {},
          ),
      },
    ),
    // One plan, one quota, so both callers count against one provider total.
    countRequest: () => count(source),
  };
  perEnv.set(caller, made);
  return made;
}
