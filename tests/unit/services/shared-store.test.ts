import { describe, expect, it, vi } from "vitest";
import { MemoryCache } from "@/services/cache";
import { parseEnv } from "@/services/env";
import { EncryptedRedisCache } from "@/services/redis-cache";
import { UNLIMITED_BUDGET } from "@/services/live-budget";
import { createPnrCache, liveBudget, resetLocalState } from "@/services/shared-store";

const DATA_KEY = Buffer.alloc(32, 7).toString("base64");

function envOf(source: Record<string, string>) {
  const parsed = parseEnv(source);
  if (!parsed.ok) throw new Error(parsed.issues.join());
  return parsed.env;
}

describe("createPnrCache", () => {
  it("uses this instance's memory without a shared store", () => {
    expect(createPnrCache(envOf({ NODE_ENV: "test" }))).toBeInstanceOf(MemoryCache);
  });

  it("uses the encrypted Redis cache when the shared store is configured", () => {
    const current = envOf({ NODE_ENV: "test", KV_REST_API_URL: "https://x.upstash.io", KV_REST_API_TOKEN: "t", DATA_KEY });
    expect(createPnrCache(current)).toBeInstanceOf(EncryptedRedisCache);
  });

  it("builds one store per environment, shared by the cache and the limiter", () => {
    const current = envOf({ NODE_ENV: "test", KV_REST_API_URL: "https://x.upstash.io", KV_REST_API_TOKEN: "t", DATA_KEY });
    expect(createPnrCache(current)).toBe(createPnrCache(current));
  });
});

describe("liveBudget", () => {
  const FAKE_RAILKIT = `railkit_${"a1".repeat(16)}`;

  it("has no budget for sources that spend no provider quota", () => {
    expect(liveBudget(envOf({ NODE_ENV: "test", PNR_SOURCE: "fixture" }))).toBe(UNLIMITED_BUDGET);
    expect(liveBudget(envOf({ NODE_ENV: "test" }))).toBe(UNLIMITED_BUDGET);
  });

  it("holds a third-party source to LIVE_REQUESTS_PER_DAY, and logs the day's refusal once, without a PNR", async () => {
    resetLocalState();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const current = envOf({ NODE_ENV: "test", PNR_SOURCE: "railkit", RAILKIT_API_KEY: FAKE_RAILKIT, LIVE_REQUESTS_PER_DAY: "2" });
    const budget = liveBudget(current);
    expect(liveBudget(current)).toBe(budget);
    expect((await budget.take()).ok).toBe(true);
    expect((await budget.take()).ok).toBe(true);
    expect((await budget.take()).ok).toBe(false);
    expect((await budget.take()).ok).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^\[budget\]/);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/\d{10}/);
    warn.mockRestore();
  });
});
