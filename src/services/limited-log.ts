import type { RateLimiter, RateLimitResult } from "./rate-limit";
import type { RedisLike } from "./upstash";
import { istDate } from "./usage";

// Who hit a traveller limit today: module 04's "Limited today" and "Most limited today".
//
// Until this, the limiter said no and forgot. This records one line per refused TRAVELLER check,
// under a keyed hash of the address — never the address — for India's day, kept two days.
//
// **Recording is best-effort; reading is not.** A refusal that cannot be counted is dropped: counting
// must never be why a check fails or slows. A read that cannot reach the store throws, because the
// page asking would otherwise draw "No address hit the limit today" about a day it knows nothing of.

/**
 * The limiter scopes keyed by a traveller's address. Account writes (`write:<user id>`) and console
 * sign-in are not addresses checking trains, so they are left out. A tripwire in the tests fails when
 * a service adds an address-keyed limit whose scope is not here.
 */
export const LIMITED_SCOPES = ["pnr", "stations", "availability", "availabilityClasses", "route", "routeAvailability", "trainRoute", "subscribe"] as const;

const KEPT_MS = 2 * 24 * 60 * 60 * 1000;

/** The address in a traveller limiter key ("pnr:1.2.3.4" → "1.2.3.4"), or null for any other key. */
export function limitedAddress(key: string): string | null {
  const colon = key.indexOf(":");
  if (colon === -1) return null;
  const scope = key.slice(0, colon);
  return (LIMITED_SCOPES as readonly string[]).includes(scope) ? key.slice(colon + 1) : null;
}

export type AddressNetwork = "ipv4" | "ipv6" | "unknown";

export interface LimitedAddress {
  /** A keyed hash of the address: stable within a data key, useless without it. */
  readonly hash: string;
  /** "ipv6" is a whole /64 — the limiter keys IPv6 by network — which the sheet tags; the hash alone could not say. */
  readonly network: AddressNetwork;
  readonly times: number;
  /** Epoch ms. */
  readonly firstSeen: number;
  readonly lastSeen: number;
}

export interface LimitedToday {
  /** Every refusal today, not only the top n's. */
  readonly total: number;
  /** The n most-refused addresses, busiest first. */
  readonly top: readonly LimitedAddress[];
}

export interface LimitedLog {
  record(address: string, at: number): Promise<void>;
  today(n: number, at: number): Promise<LimitedToday>;
}

/** One refusal: its count, its first and last sighting, and the day's total — one atomic step. */
export const RECORD_LIMITED_SCRIPT =
  "redis.call('ZINCRBY', KEYS[1], 1, ARGV[1]) " +
  "redis.call('ZADD', KEYS[2], 'NX', ARGV[2], ARGV[1]) " +
  "redis.call('ZADD', KEYS[3], ARGV[2], ARGV[1]) " +
  "redis.call('INCR', KEYS[4]) " +
  "for i = 1, 4 do if redis.call('PTTL', KEYS[i]) < 0 then redis.call('PEXPIRE', KEYS[i], ARGV[3]) end end " +
  "return 1";

/** The day's total, then member · times · first · last for the busiest n. */
export const READ_LIMITED_SCRIPT =
  "local top = redis.call('ZREVRANGE', KEYS[1], 0, tonumber(ARGV[1]) - 1, 'WITHSCORES') " +
  "local out = { redis.call('GET', KEYS[4]) or '0' } " +
  "for i = 1, #top, 2 do " +
  "out[#out + 1] = top[i] out[#out + 1] = top[i + 1] " +
  "out[#out + 1] = redis.call('ZSCORE', KEYS[2], top[i]) or '0' " +
  "out[#out + 1] = redis.call('ZSCORE', KEYS[3], top[i]) or '0' end " +
  "return out";

const KIND: Record<AddressNetwork, string> = { ipv4: "4", ipv6: "6", unknown: "?" };

function networkOf(address: string): AddressNetwork {
  if (address.endsWith("::/64")) return "ipv6";
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(address) ? "ipv4" : "unknown";
}

/** What is stored: the kind, a dot, the hash. base64url has no dot, so the first one splits them. */
export function memberFor(address: string, hash: (address: string) => string): string {
  return `${KIND[networkOf(address)]}.${hash(address)}`;
}

export function readMember(member: string): { readonly hash: string; readonly network: AddressNetwork } {
  const dot = member.indexOf(".");
  const kind = member.slice(0, dot);
  return { hash: member.slice(dot + 1), network: kind === "4" ? "ipv4" : kind === "6" ? "ipv6" : "unknown" };
}

function dayKeys(prefix: string, at: number): string[] {
  const base = `${prefix}:limited:${istDate(new Date(at))}`;
  return [`${base}:times`, `${base}:first`, `${base}:last`, `${base}:total`];
}

export function redisLimitedLog(redis: RedisLike, prefix: string, hash: (address: string) => string, now: () => number = Date.now): LimitedLog {
  return {
    async record(address, at) {
      try {
        await redis.eval(RECORD_LIMITED_SCRIPT, dayKeys(prefix, at), [memberFor(address, hash), String(at), String(KEPT_MS)]);
      } catch {
        // Best-effort, as above.
      }
    },
    async today(n, at = now()) {
      const raw = await redis.eval(READ_LIMITED_SCRIPT, dayKeys(prefix, at), [String(n)]);
      const flat = Array.isArray(raw) ? raw.map(String) : [];
      const top: LimitedAddress[] = [];
      for (let i = 1; i + 3 < flat.length; i += 4) {
        top.push({ ...readMember(flat[i]!), times: Number(flat[i + 1]), firstSeen: Number(flat[i + 2]), lastSeen: Number(flat[i + 3]) });
      }
      return { total: Number(flat[0] ?? 0), top };
    },
  };
}

/** This instance's own count, for a deployment with no shared store. */
export function memoryLimitedLog(hash: (address: string) => string): LimitedLog {
  const days = new Map<string, Map<string, { times: number; firstSeen: number; lastSeen: number }>>();
  return {
    async record(address, at) {
      const day = istDate(new Date(at));
      const seen = days.get(day) ?? new Map();
      const key = memberFor(address, hash);
      const known = seen.get(key);
      seen.set(key, known ? { ...known, times: known.times + 1, lastSeen: at } : { times: 1, firstSeen: at, lastSeen: at });
      days.set(day, seen);
      // Keep today and yesterday at most, as the shared store's two-day expiry does.
      if (days.size > 2) days.delete(days.keys().next().value!);
    },
    async today(n, at) {
      const seen = days.get(istDate(new Date(at))) ?? new Map();
      const rows = [...seen].map(([member, r]) => ({ ...readMember(member), ...r }));
      return {
        total: rows.reduce((sum, r) => sum + r.times, 0),
        top: rows.sort((a, b) => b.times - a.times || b.lastSeen - a.lastSeen).slice(0, n),
      };
    },
  };
}

export interface RecordingLimiter extends RateLimiter {
  /** The limiter whose refusals this records — which one it is (per instance or shared) is still a fact worth asserting. */
  readonly limiter: RateLimiter;
}

/** The limiter, unchanged, that also writes down each refused traveller check. */
export function recordingLimiter(limiter: RateLimiter, log: LimitedLog, now: () => number = Date.now): RecordingLimiter {
  return {
    limiter,
    async check(key, limit, windowMs): Promise<RateLimitResult> {
      const verdict = await limiter.check(key, limit, windowMs);
      const address = verdict.ok ? null : limitedAddress(key);
      if (address !== null) await log.record(address, now()).catch(() => undefined);
      return verdict;
    },
  };
}
