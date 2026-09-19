import { describe, expect, it, vi } from "vitest";
import { MemoryKv, type Kv } from "@/services/kv";
import { BUDGET_TTL_MS, createLiveBudget, secondsToIstMidnight } from "@/services/live-budget";

// 18:00 UTC on the 18th is 23:30 on the 18th in India; 18:30 UTC is midnight there.
const LATE_EVENING_IST = Date.parse("2026-09-18T18:00:00.000Z");
const MIDNIGHT_IST = Date.parse("2026-09-18T18:30:00.000Z");

function setup(limit: () => number, at = LATE_EVENING_IST) {
  const clock = { now: at };
  const kv = new MemoryKv(() => clock.now);
  const reached = vi.fn();
  const budget = createLiveBudget({ kv, prefix: "tt:test", limit, now: () => clock.now, onReached: reached });
  return { kv, budget, reached, clock };
}

describe("secondsToIstMidnight", () => {
  it("counts down to the next midnight in India", () => {
    expect(secondsToIstMidnight(LATE_EVENING_IST)).toBe(30 * 60);
    expect(secondsToIstMidnight(MIDNIGHT_IST)).toBe(24 * 60 * 60);
    expect(secondsToIstMidnight(Date.parse("2026-09-19T06:30:00.000Z"))).toBe(12 * 60 * 60);
    expect(secondsToIstMidnight(Date.parse("2026-09-18T18:29:59.500Z"))).toBe(1);
  });
});

describe("the daily live-request budget", () => {
  it("lets live requests through until the day's budget is spent, then refuses until midnight IST", async () => {
    const { budget } = setup(() => 3);
    for (let i = 0; i < 3; i += 1) expect(await budget.take()).toEqual({ ok: true });
    expect(await budget.take()).toEqual({ ok: false, retryAfterSeconds: 30 * 60 });
  });

  it("counts every address together under one key per day in India, kept for two days", async () => {
    const { kv, budget } = setup(() => 3);
    await budget.take();
    await budget.take();
    await expect(kv.get("tt:test:budget:live:2026-09-18")).resolves.toBe("2");
    await expect(kv.ttl("tt:test:budget:live:2026-09-18")).resolves.toBe(BUDGET_TTL_MS);
    expect(BUDGET_TTL_MS).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it("starts again at midnight in India", async () => {
    const { budget, clock } = setup(() => 1);
    await budget.take();
    expect((await budget.take()).ok).toBe(false);
    clock.now = MIDNIGHT_IST;
    expect(await budget.take()).toEqual({ ok: true });
  });

  it("reads the limit on every request, so it can change during the day", async () => {
    const limit = { value: 1 };
    const { budget } = setup(() => limit.value);
    await budget.take();
    expect((await budget.take()).ok).toBe(false);
    limit.value = 5;
    expect((await budget.take()).ok).toBe(true);
  });

  it("reports the budget reached once a day, with the day and the limit and nothing else", async () => {
    const { budget, reached, clock } = setup(() => 1);
    await budget.take();
    await budget.take();
    await budget.take();
    expect(reached).toHaveBeenCalledTimes(1);
    expect(reached).toHaveBeenCalledWith({ day: "2026-09-18", limit: 1 });
    clock.now = MIDNIGHT_IST;
    await budget.take();
    await budget.take();
    expect(reached).toHaveBeenCalledTimes(2);
    expect(reached).toHaveBeenLastCalledWith({ day: "2026-09-19", limit: 1 });
  });

  it("reports once across instances that share the store", async () => {
    const kv = new MemoryKv(() => LATE_EVENING_IST);
    const first = vi.fn();
    const second = vi.fn();
    const a = createLiveBudget({ kv, prefix: "tt:test", limit: () => 1, now: () => LATE_EVENING_IST, onReached: first });
    const b = createLiveBudget({ kv, prefix: "tt:test", limit: () => 1, now: () => LATE_EVENING_IST, onReached: second });
    await a.take();
    await a.take();
    await b.take();
    await b.take();
    expect(first.mock.calls.length + second.mock.calls.length).toBe(1);
  });

  it("lets checks through when the store can't count, as the limiter does", async () => {
    const broken: Kv = {
      get: async () => null,
      set: async () => undefined,
      del: async () => undefined,
      incr: async () => {
        throw new Error("store down");
      },
      ttl: async () => 0,
    };
    const budget = createLiveBudget({ kv: broken, prefix: "tt:test", limit: () => 1, now: () => LATE_EVENING_IST });
    expect(await budget.take()).toEqual({ ok: true });
    expect(await budget.take()).toEqual({ ok: true });
  });
});
