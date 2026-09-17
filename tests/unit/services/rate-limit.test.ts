import { describe, it, expect } from "vitest";
import { MemoryRateLimiter, clientIp } from "@/services/rate-limit";

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
  it("uses memory unless the upstash strategy is selected with credentials", async () => {
    const { createRateLimiter, MemoryRateLimiter, UpstashRateLimiter } = await import("@/services/rate-limit");
    const { parseEnv } = await import("@/services/env");
    const memory = parseEnv({ NODE_ENV: "test", UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" });
    const upstash = parseEnv({ NODE_ENV: "test", RATE_LIMIT_STRATEGY: "upstash", UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" });
    if (!memory.ok || !upstash.ok) throw new Error("expected valid env");
    expect(createRateLimiter(memory.env)).toBeInstanceOf(MemoryRateLimiter);
    expect(createRateLimiter(upstash.env)).toBeInstanceOf(UpstashRateLimiter);
  });
});
