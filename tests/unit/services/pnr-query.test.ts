import { describe, expect, it, vi } from "vitest";
import { MemoryCache } from "@/services/cache";
import { queryPnr } from "@/services/pnr-query";
import { MemoryRateLimiter } from "@/services/rate-limit";
import { singleFlight } from "@/services/single-flight";
import { fixtureSource } from "@/services/sources/fixture";
import type { PnrOutcome } from "@/types/domain";

function deps() {
  let now = 1_000_000;
  return {
    source: fixtureSource,
    limiter: new MemoryRateLimiter(),
    cache: new MemoryCache(() => now),
    flight: singleFlight<PnrOutcome>(),
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

  it("shares one provider call between concurrent checks of one PNR", async () => {
    const d = deps();
    const check = vi.fn((pnr: string) => fixtureSource.check(pnr));
    const source = { ...fixtureSource, check };
    const [a, b] = await Promise.all([
      queryPnr("2345678901", "1.1.1.1", { deps: { ...d, source } }),
      queryPnr("2345678901", "1.1.1.2", { deps: { ...d, source } }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
