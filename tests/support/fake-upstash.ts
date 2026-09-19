import { INCR_SCRIPT } from "@/services/kv";
import type { RedisLike, WindowLimiterFactory, WindowVerdict } from "@/services/upstash";

// An in-memory stand-in for Upstash: shared by every "instance" a test builds,
// with its own clock, an outage switch, and a dump for "never in the clear" checks.

export interface FakeUpstash {
  readonly redis: RedisLike;
  readonly windows: WindowLimiterFactory;
  /** Every key, value and limiter identifier Redis holds, as one string. */
  dump(): string;
  entries(): ReadonlyArray<readonly [string, string]>;
  put(key: string, value: string): void;
  fail(on: boolean): void;
  tick(ms: number): void;
  reset(): void;
}

export function createFakeUpstash(): FakeUpstash {
  const store = new Map<string, { readonly value: string; readonly exp: number }>();
  const hits = new Map<string, readonly number[]>();
  const state = { now: 1_000_000, failing: false };
  const guard = () => {
    if (state.failing) throw new Error("fake outage");
  };

  const redis: RedisLike = {
    async get(key) {
      guard();
      const entry = store.get(key);
      return entry && entry.exp > state.now ? entry.value : null;
    },
    async set(key, value, { px }) {
      guard();
      store.set(key, { value, exp: state.now + px });
      return "OK";
    },
    async del(key) {
      guard();
      return store.delete(key) ? 1 : 0;
    },
    async pttl(key) {
      guard();
      const entry = store.get(key);
      if (!entry || entry.exp <= state.now) return -2;
      return entry.exp === Infinity ? -1 : entry.exp - state.now;
    },
    async eval(script, keys, args) {
      guard();
      if (script !== INCR_SCRIPT) throw new Error("fake-upstash: unknown script");
      const [key] = keys;
      const [ttlMs, refresh] = args;
      const entry = store.get(key);
      const live = entry && entry.exp > state.now ? entry : undefined;
      const count = (live ? Number(live.value) : 0) + 1;
      const exp = count === 1 || refresh === "1" ? state.now + Number(ttlMs) : (live?.exp ?? Infinity);
      store.set(key, { value: String(count), exp });
      return count;
    },
  };

  const windows: WindowLimiterFactory = (limit, windowMs) => ({
    async limit(identifier): Promise<WindowVerdict> {
      guard();
      const name = `${limit}-${windowMs}:${identifier}`;
      const recent = (hits.get(name) ?? []).filter((t) => t > state.now - windowMs);
      if (recent.length >= limit) return { success: false, remaining: 0, reset: recent[0] + windowMs };
      hits.set(name, [...recent, state.now]);
      return { success: true, remaining: limit - recent.length - 1, reset: state.now + windowMs };
    },
  });

  return {
    redis,
    windows,
    dump: () => [...[...store].map(([k, v]) => `${k}=${v.value}`), ...hits.keys()].join("\n"),
    entries: () => [...store].map(([k, v]) => [k, v.value] as const),
    put: (key, value) => {
      store.set(key, { value, exp: state.now + 60_000 });
    },
    fail: (on) => {
      state.failing = on;
    },
    tick: (ms) => {
      state.now += ms;
    },
    reset: () => {
      store.clear();
      hits.clear();
      state.now = 1_000_000;
      state.failing = false;
    },
  };
}
