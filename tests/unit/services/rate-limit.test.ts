import { beforeEach, describe, it, expect, vi } from "vitest";
import { MemoryRateLimiter, SharedRateLimiter, clientIp } from "@/services/rate-limit";
import type { WindowLimiterFactory } from "@/services/upstash";
import { createFakeUpstash } from "../../support/fake-upstash";

describe("MemoryRateLimiter", () => {
  it("allows requests under the limit", () => {
    const limiter = new MemoryRateLimiter();
    const result = limiter.check("test-key", 5, 60_000);
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks requests over the limit", () => {
    const limiter = new MemoryRateLimiter();
    for (let i = 0; i < 5; i++) {
      limiter.check("test-key", 5, 60_000);
    }
    const result = limiter.check("test-key", 5, 60_000);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", () => {
    const limiter = new MemoryRateLimiter();
    for (let i = 0; i < 3; i++) {
      limiter.check("key-a", 3, 60_000);
    }
    const blocked = limiter.check("key-a", 3, 60_000);
    expect(blocked.ok).toBe(false);

    const allowed = limiter.check("key-b", 3, 60_000);
    expect(allowed.ok).toBe(true);
  });

  it("decrements remaining correctly", () => {
    const limiter = new MemoryRateLimiter();
    const r1 = limiter.check("k", 3, 60_000);
    expect(r1.remaining).toBe(2);
    const r2 = limiter.check("k", 3, 60_000);
    expect(r2.remaining).toBe(1);
    const r3 = limiter.check("k", 3, 60_000);
    expect(r3.remaining).toBe(0);
  });
});

describe("clientIp", () => {
  it("returns first XFF hop", () => {
    expect(clientIp(null, "1.2.3.4, 5.6.7.8")).toBe("1.2.3.4");
  });

  it("returns direct IP when no XFF", () => {
    expect(clientIp("10.0.0.1", null)).toBe("10.0.0.1");
  });

  it("returns unknown when no IP info", () => {
    expect(clientIp(null, null)).toBe("unknown");
  });
});

describe("createRateLimiter", () => {
  it("keeps limits in the instance unless the shared store is configured", async () => {
    const { createRateLimiter } = await import("@/services/shared-store");
    const { parseEnv } = await import("@/services/env");
    const DATA_KEY = Buffer.alloc(32, 7).toString("base64");
    const memory = parseEnv({ NODE_ENV: "test", UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" });
    const shared = parseEnv({ NODE_ENV: "test", UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t", DATA_KEY });
    if (!memory.ok || !shared.ok) throw new Error("expected valid env");
    expect(createRateLimiter(memory.env)).toBeInstanceOf(MemoryRateLimiter);
    expect(createRateLimiter(shared.env)).toBeInstanceOf(SharedRateLimiter);
  });
});

describe("SharedRateLimiter", () => {
  const fake = createFakeUpstash();
  const identify = (key: string) => `h(${key.length})`;
  beforeEach(() => fake.reset());

  function limiter(windows = fake.windows, onFallback = vi.fn()) {
    return new SharedRateLimiter({ windows, identify, onFallback, now: () => 1_000_000 });
  }

  it("counts down, then refuses with the time until a slot frees", async () => {
    const shared = limiter();
    const first = await shared.check("pnr:203.0.113.10", 2, 60_000);
    await shared.check("pnr:203.0.113.10", 2, 60_000);
    const third = await shared.check("pnr:203.0.113.10", 2, 60_000);
    expect(first).toEqual({ ok: true, remaining: 1, retryAfterSeconds: 0 });
    expect(third).toEqual({ ok: false, remaining: 0, retryAfterSeconds: 60 });
  });

  it("shows the store only the hashed identifier", async () => {
    await limiter().check("pnr:203.0.113.10", 20, 60_000);
    expect(fake.dump()).not.toContain("203.0.113.10");
  });

  it("keeps separate windows for separate limits", async () => {
    const shared = limiter();
    await shared.check("pnr:a", 1, 60_000);
    expect((await shared.check("write:a", 60, 60_000)).ok).toBe(true);
  });

  it("falls back to this instance's memory when the store times out", async () => {
    const onFallback = vi.fn();
    const slow: WindowLimiterFactory = () => ({ limit: async () => ({ success: true, remaining: 99, reset: 0, reason: "timeout" }) });
    const shared = limiter(slow, onFallback);
    await shared.check("pnr:x", 1, 60_000);
    expect((await shared.check("pnr:x", 1, 60_000)).ok).toBe(false);
    expect(onFallback).toHaveBeenCalledWith("timeout");
  });

  it("falls back to this instance's memory when the store fails", async () => {
    const onFallback = vi.fn();
    fake.fail(true);
    const shared = limiter(fake.windows, onFallback);
    await shared.check("pnr:y", 1, 60_000);
    expect((await shared.check("pnr:y", 1, 60_000)).ok).toBe(false);
    expect(onFallback).toHaveBeenCalledWith("error");
  });
});
