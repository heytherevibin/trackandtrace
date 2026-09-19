import { createBreaker } from "./breaker";
import { pnrCache, type Cache } from "./cache";
import { deriveDataKeys, keyedHash } from "./data-key";
import { env, sharedStoreConfig, type Env, type ThirdPartySource } from "./env";
import { MemoryKv, redisKv, resilientKv, type Kv } from "./kv";
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
const guards = new WeakMap<Env, Map<ThirdPartySource, GuardDeps>>();
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

/** One breaker and one usage counter per provider, shared by every check in this environment. */
export function providerGuard(source: ThirdPartySource, current: Env = env()): GuardDeps {
  const perEnv = guards.get(current) ?? new Map<ThirdPartySource, GuardDeps>();
  guards.set(current, perEnv);
  const known = perEnv.get(source);
  if (known) return known;
  const { kv, prefix } = stateStore(current);
  const count = createUsageCounter(kv, prefix);
  const made: GuardDeps = {
    breaker: createBreaker(kv, `${prefix}:breaker:${source}`, {
      onChange: (event) =>
        log.warn(`[source:${source}] breaker ${event.state}`, event.state === "open" ? { seconds: event.openMs / 1000, reason: event.reason } : {}),
    }),
    countRequest: () => count(source),
  };
  perEnv.set(source, made);
  return made;
}
