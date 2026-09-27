import { randomBytes } from "node:crypto";
import { createBreaker, type BreakerScope } from "./breaker";
import { pnrCache, type Cache } from "./cache";
import { deriveDataKeys, keyedHash } from "./data-key";
import { activePnrSource, env, isThirdPartySource, sharedStoreConfig, type Env, type ThirdPartySource } from "./env";
import { liveChecksPerDay } from "./runtime-settings";
import { MemoryKv, redisKv, resilientKv, type Kv } from "./kv";
import { UNLIMITED_BUDGET, createLiveBudget, type LiveBudget } from "./live-budget";
import { memoryLimitedLog, recordingLimiter, redisLimitedLog, type LimitedLog, type RecordingLimiter } from "./limited-log";
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

/** Without a shared store there is no DATA_KEY to hash with, so this instance hashes with a key of its own that never leaves memory. */
const randomKey = randomBytes(32);
const localLimited = memoryLimitedLog((address) => keyedHash(randomKey, `address:${address}`));
const limitedLogs = new WeakMap<Env, LimitedLog>();

/** The limited log refusals are written to: Upstash when configured, else this instance's memory. */
function limitedLog(current: Env): LimitedLog {
  const config = sharedStoreConfig(current);
  if (!config) return localLimited;
  const known = limitedLogs.get(current);
  if (known) return known;
  const clientId = deriveDataKeys(config.dataKey).clientId;
  const made = redisLimitedLog(connectRedis(config.credentials, STATE_TIMEOUT_MS), config.prefix, (address) => keyedHash(clientId, `address:${address}`));
  limitedLogs.set(current, made);
  return made;
}

/**
 * Every refused TRAVELLER check is written down as it happens (module 04). Best-effort: the limiter's
 * verdict is returned unchanged whether or not the line was written.
 */
export function createRateLimiter(current: Env = env()): RecordingLimiter {
  return recordingLimiter(store(current)?.limiter ?? new MemoryRateLimiter(), limitedLog(current));
}

/**
 * The same log, for module 04 to read. Its reads throw when Upstash does not answer — the redis log
 * has no fallback — so the page can say the counts are unavailable rather than draw a quiet day.
 */
export function limitedLogForReading(current: Env = env()): LimitedLog {
  return limitedLog(current);
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

/**
 * The plain shared store, for values that are facts about the railway rather than about a person.
 *
 * Deliberately NOT `createPnrCache`: that one is encrypted and keyed for reservation records, and
 * a timetable is neither personal nor secret. Sharing it would encrypt a public timetable and, far
 * worse, put railway data under the key reserved for passenger data.
 */
export function publicStore(current: Env = env()): { readonly kv: Kv; readonly prefix: string } {
  return stateStore(current);
}

const readers = new WeakMap<Env, { readonly kv: Kv; readonly prefix: string }>();

/**
 * The same store as `publicStore`, for a page that REPORTS on it — without the fallback.
 *
 * `publicStore` answers from this instance's memory whenever Upstash errors, which is right for a
 * breaker deciding whether to call and wrong for a dashboard: an unreachable store then reads as an
 * empty one, and the page says "Answering" and "0 requests" about a day it knows nothing of. Here a
 * failed read throws, so `readBreakerState` comes back `known: false` and `readUsageHistory` gives
 * the day as unknown — the paths they were written with and could never reach.
 *
 * Unconfigured, it is the same memory `publicStore` uses, because that is where the counts are.
 */
export function publicStoreForReading(current: Env = env()): { readonly kv: Kv; readonly prefix: string } {
  const config = sharedStoreConfig(current);
  if (!config) return stateStore(current);
  const known = readers.get(current);
  if (known) return known;
  const made = { kv: redisKv(connectRedis(config.credentials, STATE_TIMEOUT_MS)), prefix: config.prefix };
  readers.set(current, made);
  return made;
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
    limit: () => liveChecksPerDay(current),
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

/**
 * The four keys a caller's fuse lives under, in ONE place.
 *
 * `providerGuard` builds a breaker over these; module 02's page reads the same keys to draw the
 * fuse's state. Two callers computing a key shape is two key shapes waiting to disagree — and the
 * failure would be silent in the worst way, a dashboard confidently reporting "Answering" off keys
 * nothing writes.
 *
 * The provider base is the key this product has always used; adding a caller segment to it gives
 * each caller its own four keys without moving anyone else's.
 */
export function breakerScopeFor(source: ThirdPartySource, endpoint: GuardEndpoint, prefix: string): BreakerScope {
  return { provider: `${prefix}:breaker:${source}`, endpoint: `${prefix}:breaker:${source}:${endpoint}` };
}

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
      breakerScopeFor(source, endpoint, prefix),
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
