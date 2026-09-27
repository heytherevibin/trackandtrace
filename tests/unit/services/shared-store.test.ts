import { describe, expect, it, vi } from "vitest";
import { MemoryCache } from "@/services/cache";
import { parseEnv } from "@/services/env";
import { EncryptedRedisCache } from "@/services/redis-cache";
import { UNLIMITED_BUDGET } from "@/services/live-budget";
import { addressMember, blocksForConsole, createPnrCache, createRateLimiter, limitedLogForReading, liveBudget, providerGuard, publicStore, publicStoreForReading, resetLocalState } from "@/services/shared-store";
import { readUsageHistory } from "@/services/usage";
import type { SourceOutcome } from "@/services/sources/outcome";

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

describe("publicStoreForReading", () => {
  // A dashboard reading the shared store must be told when it cannot. `publicStore` falls back to
  // this instance's memory on any error — right for a breaker deciding whether to call, wrong for a
  // page reporting what every instance did: an unreachable Upstash then reads as an empty store, and
  // the page says "Answering" and "0 requests" about a day it knows nothing of.
  const UNREACHABLE = { NODE_ENV: "test", KV_REST_API_URL: "http://127.0.0.1:1", KV_REST_API_TOKEN: "t", DATA_KEY };

  it("fails a read when the shared store cannot be reached, rather than answering from this instance", async () => {
    await expect(publicStoreForReading(envOf(UNREACHABLE)).kv.get("anything")).rejects.toThrow();
  });

  it("so a day the store could not answer for reads as unknown, not as a quiet day", async () => {
    const { kv, prefix } = publicStoreForReading(envOf(UNREACHABLE));
    const [day] = await readUsageHistory(kv, prefix, "railkit", 1);
    expect(day?.requests).toBeNull();
  });

  it("reads this instance's memory when no shared store is configured, because that is where the counts are", () => {
    const current = envOf({ NODE_ENV: "test" });
    expect(publicStoreForReading(current)).toEqual(publicStore(current));
  });

  it("keeps the prefix the writers use", () => {
    const current = envOf(UNREACHABLE);
    expect(publicStoreForReading(current).prefix).toBe(publicStore(current).prefix);
  });
});

describe("createRateLimiter and limitedLogForReading", () => {
  it("writes each refused traveller check where module 04 reads it, and never the address", async () => {
    const current = envOf({ NODE_ENV: "test" });
    const limiter = createRateLimiter(current);
    const before = (await limitedLogForReading(current).today(10, Date.now())).total;
    for (let i = 0; i < 3; i += 1) await limiter.check("pnr:198.51.100.7", 1, 60_000);

    const today = await limitedLogForReading(current).today(10, Date.now());
    expect(today.total - before).toBe(2);
    expect(JSON.stringify(today)).not.toContain("198.51.100.7");
  });

  it("fails a read when the shared store cannot be reached", async () => {
    const current = envOf({ NODE_ENV: "test", KV_REST_API_URL: "http://127.0.0.1:1", KV_REST_API_TOKEN: "t", DATA_KEY });
    await expect(limitedLogForReading(current).today(10, Date.now())).rejects.toThrow();
  });
});

describe("blocking, end to end over this instance's memory", () => {
  it("refuses a blocked address's next traveller check, and lets it through once lifted", async () => {
    const current = envOf({ NODE_ENV: "test" });
    const limiter = createRateLimiter(current);
    const blocks = blocksForConsole(current);
    const member = addressMember(current, "192.0.2.44");
    const now = Date.now();

    await blocks.list.block(member, { note: "", by: "Asha Rao", since: now, until: null, keyId: blocks.keyId });
    blocks.invalidate();
    expect((await limiter.check("pnr:192.0.2.44", 20, 60_000)).ok).toBe(false);
    expect((await limiter.check("pnr:192.0.2.45", 20, 60_000)).ok).toBe(true);

    await blocks.list.unblock(member);
    blocks.invalidate();
    expect((await limiter.check("pnr:192.0.2.44", 20, 60_000)).ok).toBe(true);
  });

  it("hashes an address the way the limited log does, so a Most limited row blocks the same address", () => {
    const current = envOf({ NODE_ENV: "test" });
    expect(addressMember(current, "192.0.2.44")).toMatch(/^4\.[A-Za-z0-9_-]{43}$/);
    expect(addressMember(current, "2001:db8:0:1::5")).toMatch(/^6\./);
    expect(addressMember(current, "2001:db8:0:1::5")).toBe(addressMember(current, "2001:db8:0:1::9"));
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

describe("providerGuard", () => {
  const FAKE_RAILKIT = `railkit_${"a1".repeat(16)}`;
  const serverError: SourceOutcome = { ok: false, code: "SOURCE_UNAVAILABLE", message: "x", cause: "server" };
  const keyRefused: SourceOutcome = { ok: false, code: "SOURCE_UNAVAILABLE", message: "x", cause: "refused", status: 401 };
  const notOnRoute: SourceOutcome = { ok: false, code: "INVALID", message: "not an intermediate station" };

  function railkit() {
    resetLocalState();
    const current = envOf({ NODE_ENV: "test", PNR_SOURCE: "railkit", RAILKIT_API_KEY: FAKE_RAILKIT });
    return { pnr: providerGuard("railkit", "pnr", current), availability: providerGuard("railkit", "availability", current), current };
  }

  it("gives one caller of a provider the same guard twice, and the other caller a different one", () => {
    const { pnr, availability, current } = railkit();
    expect(providerGuard("railkit", "pnr", current)).toBe(pnr);
    expect(availability).not.toBe(pnr);
  });

  it("keeps a crawler's refusals — and its wrong questions — off the live PNR fuse", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pnr, availability } = railkit();
    for (let i = 0; i < 10; i += 1) await availability.breaker.record(serverError);
    for (let i = 0; i < 10; i += 1) await availability.breaker.record(notOnRoute);
    await expect(availability.breaker.admit()).resolves.toMatchObject({ open: true });
    await expect(pnr.breaker.admit()).resolves.toEqual({ open: false });
    warn.mockRestore();
  });

  it("still rests the live PNR fuse when the crawler finds the key refused", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pnr, availability } = railkit();
    await availability.breaker.record(keyRefused);
    await expect(pnr.breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 600 });
    warn.mockRestore();
  });
});
