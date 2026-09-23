import type { RedisLike } from "./upstash";

// A small key-value store for breaker state and usage counts: Upstash on deployments,
// this instance's memory locally or while Upstash is down.

export interface Kv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Adds one and returns the count. A new count lives `ttlMs`; `refreshTtl` restarts that on every call. */
  incr(key: string, ttlMs: number, refreshTtl?: boolean): Promise<number>;
  /** Milliseconds until the key expires, or 0 when it is absent. */
  ttl(key: string): Promise<number>;
}

interface Entry {
  readonly value: string;
  readonly exp: number;
}

export class MemoryKv implements Kv {
  private readonly store = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  private live(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.exp > this.now()) return entry;
    this.store.delete(key);
    return undefined;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    this.store.set(key, { value, exp: this.now() + ttlMs });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incr(key: string, ttlMs: number, refreshTtl = false): Promise<number> {
    const entry = this.live(key);
    const count = (entry ? Number(entry.value) : 0) + 1;
    this.store.set(key, { value: String(count), exp: entry && !refreshTtl ? entry.exp : this.now() + ttlMs });
    return count;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.live(key);
    return entry ? entry.exp - this.now() : 0;
  }

  /** Test seam: forget everything. */
  clear(): void {
    this.store.clear();
  }
}

/** INCR and its expiry in one atomic step, so a count can never outlive its window. */
export const INCR_SCRIPT =
  "local n = redis.call('INCR', KEYS[1]) if n == 1 or ARGV[2] == '1' then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end return n";

export function redisKv(redis: RedisLike): Kv {
  return {
    async get(key) {
      const value = await redis.get(key);
      return value === null || value === undefined ? null : String(value);
    },
    async set(key, value, ttlMs) {
      await redis.set(key, value, { px: ttlMs });
    },
    async del(key) {
      await redis.del(key);
    },
    async incr(key, ttlMs, refreshTtl = false) {
      return Number(await redis.eval(INCR_SCRIPT, [key], [String(ttlMs), refreshTtl ? "1" : "0"]));
    },
    async ttl(key) {
      const ms = await redis.pttl(key);
      return ms > 0 ? ms : 0;
    },
  };
}

/** The primary while it answers; the fallback, and a report, whenever it throws. */
export function resilientKv(primary: Kv, fallback: Kv, onError: (error: unknown) => void = () => {}): Kv {
  async function guarded<T>(run: (kv: Kv) => Promise<T>): Promise<T> {
    try {
      return await run(primary);
    } catch (error) {
      onError(error);
      return run(fallback);
    }
  }
  return {
    get: (key) => guarded((kv) => kv.get(key)),
    set: (key, value, ttlMs) => guarded((kv) => kv.set(key, value, ttlMs)),
    del: (key) => guarded((kv) => kv.del(key)),
    incr: (key, ttlMs, refreshTtl) => guarded((kv) => kv.incr(key, ttlMs, refreshTtl)),
    ttl: (key) => guarded((kv) => kv.ttl(key)),
  };
}
