import { limitedAddress, memberFor, readMember } from "./limited-log";
import type { RateLimiter, RateLimitResult } from "./rate-limit";
import type { RedisLike } from "./upstash";
import type { AddressNetwork } from "./limited-log";

// Module 04's blocklist. It lives in Upstash beside the limiter that enforces it (the owner's call,
// 2026-09-28), and the approval and the record of each block live in Postgres
// (supabase/migrations/20260928090000_console_blocks.sql): the route writes here only after the
// database has spent the tap and written the audit row.
//
// A member is exactly what the limited log stores — a kind, a dot, a keyed hash — so a row in "Most
// limited today" can be blocked as it stands. Nothing here ever holds an address.
//
// **Two readers, two rules.** The console lists blocks strictly: a store that does not answer is an
// error the page shows. A traveller check reads `cachedBlocks`, which FAILS OPEN: a copy it cannot
// refresh blocks nobody new, and keeps the last good copy rather than dropping every block at once.

export type BlockDuration = "1h" | "24h" | "7d" | "removed";

export const BLOCK_DURATIONS: readonly BlockDuration[] = ["1h", "24h", "7d", "removed"];

const HOUR_MS = 3_600_000;
const DURATION_MS: Record<Exclude<BlockDuration, "removed">, number> = { "1h": HOUR_MS, "24h": 24 * HOUR_MS, "7d": 7 * 24 * HOUR_MS };

/** When a block made at `at` for `duration` ends, or null for "until removed". */
export function durationUntil(duration: BlockDuration, at: number): number | null {
  return duration === "removed" ? null : at + DURATION_MS[duration];
}

export interface BlockRecord {
  readonly note: string;
  /** The member's name, as the audit row records it. */
  readonly by: string;
  /** Epoch ms. */
  readonly since: number;
  /** Epoch ms, or null for "until removed". */
  readonly until: number | null;
  /**
   * Which data key hashed this address. A block made under an older key no longer matches anything
   * — the same address now hashes differently — which the sheet calls a stale block.
   */
  readonly keyId: string;
}

export interface Block extends BlockRecord {
  readonly member: string;
  readonly hash: string;
  readonly network: AddressNetwork;
  /** Traveller checks refused by this block since it was made. */
  readonly refused: number;
}

export interface Blocklist {
  block(member: string, record: BlockRecord): Promise<void>;
  unblock(member: string): Promise<void>;
  /** Live blocks, newest first. Throws when the store does not answer. */
  list(at: number): Promise<readonly Block[]>;
  /** Best-effort: never throws. */
  countRefused(member: string): Promise<void>;
}

export const BLOCK_SCRIPT = "redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]) redis.call('HDEL', KEYS[2], ARGV[1]) return 1";
export const UNBLOCK_SCRIPT = "redis.call('HDEL', KEYS[1], ARGV[1]) redis.call('HDEL', KEYS[2], ARGV[1]) return 1";
export const REFUSED_SCRIPT = "return redis.call('HINCRBY', KEYS[1], ARGV[1], 1)";
export const LIST_BLOCKS_SCRIPT = "return { redis.call('HGETALL', KEYS[1]), redis.call('HGETALL', KEYS[2]) }";

function pairs(flat: unknown): ReadonlyMap<string, string> {
  const list = Array.isArray(flat) ? flat.map(String) : [];
  const out = new Map<string, string>();
  for (let i = 0; i + 1 < list.length; i += 2) out.set(list[i]!, list[i + 1]!);
  return out;
}

function parseRecord(raw: string): BlockRecord | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const r = value as Record<string, unknown>;
    if (typeof r.note !== "string" || typeof r.by !== "string" || typeof r.since !== "number" || typeof r.keyId !== "string") return null;
    if (r.until !== null && typeof r.until !== "number") return null;
    return { note: r.note, by: r.by, since: r.since, until: r.until as number | null, keyId: r.keyId };
  } catch {
    return null;
  }
}

/** The live ones, newest first. A record that cannot be read is left out rather than guessed at. */
function live(records: ReadonlyMap<string, string>, refused: ReadonlyMap<string, string>, at: number): readonly Block[] {
  const blocks: Block[] = [];
  for (const [member, raw] of records) {
    const record = parseRecord(raw);
    if (!record || (record.until !== null && record.until <= at)) continue;
    blocks.push({ member, ...readMember(member), ...record, refused: Number(refused.get(member) ?? 0) || 0 });
  }
  return blocks.sort((a, b) => b.since - a.since);
}

export function redisBlocklist(redis: RedisLike, prefix: string): Blocklist {
  const keys = [`${prefix}:blocks`, `${prefix}:blocks:refused`];
  return {
    async block(member, record) {
      await redis.eval(BLOCK_SCRIPT, keys, [member, JSON.stringify(record)]);
    },
    async unblock(member) {
      await redis.eval(UNBLOCK_SCRIPT, keys, [member]);
    },
    async list(at) {
      const raw = await redis.eval(LIST_BLOCKS_SCRIPT, keys, []);
      const [records, refused] = Array.isArray(raw) ? raw : [];
      return live(pairs(records), pairs(refused), at);
    },
    async countRefused(member) {
      try {
        await redis.eval(REFUSED_SCRIPT, [keys[1]!], [member]);
      } catch {
        // Best-effort, as above.
      }
    },
  };
}

/** This instance's own blocklist, for a deployment with no shared store. */
export function memoryBlocklist(): Blocklist {
  const records = new Map<string, string>();
  const refused = new Map<string, string>();
  return {
    async block(member, record) {
      records.set(member, JSON.stringify(record));
      refused.delete(member);
    },
    async unblock(member) {
      records.delete(member);
      refused.delete(member);
    },
    async list(at) {
      return live(records, refused, at);
    },
    async countRefused(member) {
      refused.set(member, String(Number(refused.get(member) ?? 0) + 1));
    },
  };
}

const COPY_FOR_MS = 30_000;

export interface BlockedCheck {
  has(member: string): Promise<boolean>;
  /** Refresh on the next ask — so the instance that made a block applies it at once. */
  invalidate(): void;
}

/**
 * What a traveller check asks: a copy of the live blocks, refreshed at most every 30 seconds, so the
 * blocklist costs no store call per check. A block made elsewhere takes up to 30 seconds to bite.
 *
 * Fails open, and keeps the last good copy through an outage: a copy it has never been able to read
 * blocks nobody, and one it read before keeps blocking whom it blocked rather than releasing
 * everyone the moment the store blinks.
 */
export function cachedBlocks(list: Blocklist, now: () => number = Date.now): BlockedCheck {
  let copy: ReadonlyMap<string, number | null> = new Map();
  let readAt = -Infinity;
  let pending: Promise<void> | null = null;

  async function refresh(at: number): Promise<void> {
    try {
      const blocks = await list.list(at);
      copy = new Map(blocks.map((b) => [b.member, b.until]));
    } catch {
      // Keep the last good copy; an empty first copy blocks nobody.
    }
    readAt = at;
  }

  return {
    async has(member) {
      const at = now();
      if (at - readAt > COPY_FOR_MS) {
        pending ??= refresh(at).finally(() => {
          pending = null;
        });
        await pending;
      }
      if (!copy.has(member)) return false;
      const until = copy.get(member) ?? null;
      return until === null || until > at;
    },
    invalidate() {
      readAt = -Infinity;
    },
  };
}

/** What a blocked address is told: the rate limit's own answer, so a block does not announce itself. */
const BLOCKED: RateLimitResult = { ok: false, remaining: 0, retryAfterSeconds: 60 };

/**
 * The limiter, with the blocklist in front of it for traveller addresses. A blocked address is
 * refused before the limiter is asked and the refusal is counted against its block; anything else —
 * an address not blocked, a key that is not an address, a blocklist that cannot be read — goes
 * through to the limiter unchanged.
 */
export function blockingLimiter(limiter: RateLimiter, blocked: BlockedCheck, list: Blocklist, hash: (address: string) => string): RateLimiter {
  return {
    async check(key, limit, windowMs) {
      const address = limitedAddress(key);
      if (address !== null) {
        const member = memberFor(address, hash);
        if (await blocked.has(member).catch(() => false)) {
          await list.countRefused(member);
          return BLOCKED;
        }
      }
      return limiter.check(key, limit, windowMs);
    },
  };
}
