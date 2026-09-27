import { INCRBY_SCRIPT, INCR_SCRIPT } from "@/services/kv";
import { READ_LIMITED_SCRIPT, RECORD_LIMITED_SCRIPT } from "@/services/limited-log";
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
  /** Sorted sets, for the limited log's two scripts. Expiry is not modelled: those tests stay inside a day. */
  const zsets = new Map<string, Map<string, number>>();
  const zset = (key: string): Map<string, number> => {
    const known = zsets.get(key) ?? new Map<string, number>();
    zsets.set(key, known);
    return known;
  };
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
      if (script === RECORD_LIMITED_SCRIPT) {
        const [member, at] = args as [string, string];
        const [times, first, last, total] = keys as [string, string, string, string];
        zset(times).set(member, (zset(times).get(member) ?? 0) + 1);
        if (!zset(first).has(member)) zset(first).set(member, Number(at));
        zset(last).set(member, Number(at));
        const held = store.get(total);
        store.set(total, { value: String(Number(held?.value ?? 0) + 1), exp: Infinity });
        return 1;
      }
      if (script === READ_LIMITED_SCRIPT) {
        const [times, first, last, total] = keys as [string, string, string, string];
        const top = [...zset(times)].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1)).slice(0, Number(args[0]));
        return [store.get(total)?.value ?? "0", ...top.flatMap(([m, n]) => [m, String(n), String(zset(first).get(m) ?? 0), String(zset(last).get(m) ?? 0)])];
      }
      const [key] = keys;
      const entry = store.get(key);
      const live = entry && entry.exp > state.now ? entry : undefined;
      const held = live ? Number(live.value) : 0;

      if (script === INCR_SCRIPT) {
        const [ttlMs, refresh] = args;
        const count = held + 1;
        const exp = count === 1 || refresh === "1" ? state.now + Number(ttlMs) : (live?.exp ?? Infinity);
        store.set(key, { value: String(count), exp });
        return count;
      }
      if (script === INCRBY_SCRIPT) {
        // Mirrors the Lua: floor at zero, and set the expiry when the key has none rather than
        // when the count reads 1 — a bulk add starts a counter at `by`, not at 1.
        const [ttlMs, by, refresh] = args;
        const count = Math.max(0, held + Number(by));
        const exp = live && refresh !== "1" ? live.exp : state.now + Number(ttlMs);
        store.set(key, { value: String(count), exp });
        return count;
      }
      throw new Error("fake-upstash: unknown script");
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
    dump: () => [...[...store].map(([k, v]) => `${k}=${v.value}`), ...hits.keys(), ...[...zsets].flatMap(([k, z]) => [...z.keys()].map((m) => `${k}:${m}`))].join("\n"),
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
      zsets.clear();
      state.now = 1_000_000;
      state.failing = false;
    },
  };
}
