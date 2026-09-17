import { describe, expect, it } from "vitest";
import { MemoryCache } from "@/services/cache";
import { queryPnr } from "@/services/pnr-query";
import { MemoryRateLimiter } from "@/services/rate-limit";
import { fixtureSource } from "@/services/sources/fixture";

function deps() {
  let now = 1_000_000;
  return {
    source: fixtureSource,
    limiter: new MemoryRateLimiter(),
    cache: new MemoryCache(() => now),
    now: () => now,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

describe("queryPnr", () => {
  it("rejects an invalid PNR before touching the source", async () => {
    const out = await queryPnr("12", "1.1.1.1", { deps: deps() });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("INVALID_INPUT");
  });

  it("returns a full PnrResult with cache and rate metadata", async () => {
    const d = deps();
    const first = await queryPnr("2345678901", "1.1.1.1", { deps: d });
    const second = await queryPnr("2345678901", "1.1.1.1", { deps: d });
    expect(first.ok && first.cached).toBe(false);
    expect(second.ok && second.cached).toBe(true);
    if (!first.ok) return;
    expect(first.result.snapshot.pnr).toBe("2345678901");
    expect(first.rate.limit).toBe(20);
  });

  it("bypasses the cache when fresh is requested", async () => {
    const d = deps();
    await queryPnr("2345678901", "1.1.1.1", { deps: d });
    const fresh = await queryPnr("2345678901", "1.1.1.1", { deps: d, fresh: true });
    expect(fresh.ok && fresh.cached).toBe(false);
  });

  it("maps a NOT_FOUND outcome without caching it", async () => {
    const d = deps();
    const a = await queryPnr("2345678900", "1.1.1.1", { deps: d });
    const b = await queryPnr("2345678900", "1.1.1.1", { deps: d });
    expect(a.ok).toBe(false);
    if (a.ok || b.ok) return;
    expect(a.error.code).toBe("NOT_FOUND");
    expect(b.error.code).toBe("NOT_FOUND");
  });

  it("rate limits the 21st call from one address with a retryAfter", async () => {
    const d = deps();
    for (let i = 0; i < 20; i += 1) await queryPnr("2345678901", "9.9.9.9", { deps: d });
    const out = await queryPnr("2345678901", "9.9.9.9", { deps: d });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("RATE_LIMITED");
    expect(out.error.retryAfter).toBeGreaterThan(0);
  });
});
