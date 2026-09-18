import { pnrCache, type Cache } from "./cache";
import { deriveDataKeys, keyedHash } from "./data-key";
import { env, sharedStoreConfig, type Env } from "./env";
import { log } from "./log";
import { MemoryRateLimiter, SharedRateLimiter, type RateLimiter } from "./rate-limit";
import { EncryptedRedisCache } from "./redis-cache";
import { connectRedis, upstashWindows } from "./upstash";

// Builds the shared store once per environment: the encrypted PNR cache and the
// shared limiter over one Upstash database. Without it, both stay in this instance.

const CACHE_TIMEOUT_MS = 500;
const LIMITER_TIMEOUT_MS = 1000;
const REPORT_EVERY_MS = 60_000;

interface SharedStore {
  readonly cache: Cache;
  readonly limiter: RateLimiter;
}

const stores = new WeakMap<Env, SharedStore | null>();
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
