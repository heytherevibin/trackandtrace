import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";
import { MemoryCache } from "@/services/cache";
import { UNLIMITED_BUDGET, type BudgetVerdict, type LiveBudget } from "@/services/live-budget";
import { REFRESH_MIN_AGE_MS, queryPnr } from "@/services/pnr-query";
import { MemoryRateLimiter } from "@/services/rate-limit";
import { singleFlight } from "@/services/single-flight";
import { fixtureSource } from "@/services/sources/fixture";
import type { PnrOutcome } from "@/types/domain";

// One clock for everything: the fixture stamps records with the system time, and the query
// measures a record's age against it.
const T0 = Date.parse("2026-09-19T08:00:00.000Z");
const PNR = "2345678901";
const IP = "1.1.1.1";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

function deps(budget: LiveBudget = UNLIMITED_BUDGET) {
  return {
    source: fixtureSource,
    limiter: new MemoryRateLimiter(),
    cache: new MemoryCache(),
    flight: singleFlight<PnrOutcome>(),
    budget,
    now: () => Date.now(),
    tick: (ms: number) => vi.setSystemTime(Date.now() + ms),
  };
}

function countedSource() {
  const check = vi.fn((pnr: string) => fixtureSource.check(pnr));
  return { check, source: { ...fixtureSource, check } };
}

/** A budget the test can spend: open until `spent` is set. */
function switchableBudget() {
  const state = { spent: false };
  const take = vi.fn(async (): Promise<BudgetVerdict> => (state.spent ? { ok: false, retryAfterSeconds: 1800 } : { ok: true }));
  return { state, take, budget: { take } };
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

  it("answers a Refresh from the cache while the record is under 30 seconds old, and asks the source after that", async () => {
    const { check, source } = countedSource();
    const d = { ...deps(), source };
    await queryPnr(PNR, IP, { deps: d });
    d.tick(REFRESH_MIN_AGE_MS - 1_000);
    const soon = await queryPnr(PNR, IP, { deps: d, fresh: true });
    expect(soon.ok && soon.cached).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
    d.tick(2_000);
    const later = await queryPnr(PNR, IP, { deps: d, fresh: true });
    expect(later.ok && later.cached).toBe(false);
    expect(check).toHaveBeenCalledTimes(2);
    expect(REFRESH_MIN_AGE_MS).toBe(30_000);
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

  it("limits every address in one IPv6 /64 together, and the next /64 separately", async () => {
    const d = deps();
    for (let i = 1; i <= 20; i += 1) await queryPnr(PNR, `2001:db8:1:2::${i.toString(16)}`, { deps: d });
    const same = await queryPnr(PNR, "2001:db8:1:2:ffff::1", { deps: d });
    const next = await queryPnr(PNR, "2001:db8:1:3::1", { deps: d });
    expect(same.ok).toBe(false);
    if (!same.ok) expect(same.error.code).toBe("RATE_LIMITED");
    expect(next.ok).toBe(true);
  });
});

describe("queryPnr and the daily live-request budget", () => {
  it("spends the budget only on live requests, never on answers from the cache", async () => {
    const { take, budget } = switchableBudget();
    const d = deps(budget);
    await queryPnr(PNR, IP, { deps: d });
    await queryPnr(PNR, IP, { deps: d });
    expect(take).toHaveBeenCalledTimes(1);
  });

  it("past the budget, answers unavailable until midnight IST, and never asks the source", async () => {
    const { check, source } = countedSource();
    const { state, budget } = switchableBudget();
    state.spent = true;
    const out = await queryPnr(PNR, IP, { deps: { ...deps(budget), source } });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual({ ok: false, code: "SOURCE_UNAVAILABLE", message: messages.source.outcomes.dailyLimit, retryAfter: 1800 });
    expect(check).not.toHaveBeenCalled();
  });

  it("past the budget, still answers from the cache, even for a Refresh past its minimum age", async () => {
    const { check, source } = countedSource();
    const { state, budget } = switchableBudget();
    const d = { ...deps(budget), source };
    await queryPnr(PNR, IP, { deps: d });
    state.spent = true;
    d.tick(45_000);
    const plain = await queryPnr(PNR, IP, { deps: d });
    const refresh = await queryPnr(PNR, IP, { deps: d, fresh: true });
    expect(plain.ok && plain.cached).toBe(true);
    expect(refresh.ok && refresh.cached).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("words the daily limit plainly, with its reopening time and no provider name", () => {
    expect(messages.source.outcomes.dailyLimit).toMatch(/00:00 IST/);
    expect(messages.source.outcomes.dailyLimit).not.toMatch(/railkit|rapidapi/i);
  });
});
