import { describe, expect, it } from "vitest";
import { readSourceUsage } from "@/console/sources/sources";
import type { UsageDay } from "@/services/usage";

// ---------------------------------------------------------------------------
// The figures module 02 draws, shaped from the daily counter.
//
// The sheet wants a total for the month, an average a day, and the bars. All three
// come from the same list — and all three have to agree about which days they are
// allowed to count.
//
// **A day the store could not read is not a zero**, and it must not be one in a
// total or a denominator either: an average over thirty days when four are unknown
// is not an average over thirty days.
// ---------------------------------------------------------------------------

function days(...counts: readonly (number | null)[]): readonly UsageDay[] {
  return counts.map((requests, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, requests }));
}

describe("readSourceUsage", () => {
  it("totals the month and averages over the days it could actually read", () => {
    const usage = readSourceUsage(days(10, 20, 30));

    expect(usage.monthTotal).toBe(60);
    expect(usage.averagePerDay).toBe(20);
    expect(usage.daysCounted).toBe(3);
  });

  it("leaves an unreadable day out of both the total and the divisor", () => {
    // 10 + 30 over TWO days, not three. Dividing by three would report a quieter
    // month than happened, from a day nobody can say anything about.
    const usage = readSourceUsage(days(10, null, 30));

    expect(usage.monthTotal).toBe(40);
    expect(usage.averagePerDay).toBe(20);
    expect(usage.daysCounted).toBe(2);
  });

  it("counts a real zero, because a quiet day is a day that happened", () => {
    const usage = readSourceUsage(days(10, 0, 20));

    expect(usage.monthTotal).toBe(30);
    expect(usage.averagePerDay).toBe(10);
    expect(usage.daysCounted).toBe(3);
  });

  it("says today's figure, and says nothing when today is the day it could not read", () => {
    expect(readSourceUsage(days(10, 20, 30)).today).toBe(30);
    expect(readSourceUsage(days(10, 20, null)).today).toBeNull();
  });

  it("has no average to give when nothing could be read at all", () => {
    // Zero would be a claim. Null is the absence, and the plate draws it as one.
    const usage = readSourceUsage(days(null, null));

    expect(usage.monthTotal).toBeNull();
    expect(usage.averagePerDay).toBeNull();
    expect(usage.daysCounted).toBe(0);
  });

  it("survives an empty history, which is what a store with no keys at all looks like", () => {
    const usage = readSourceUsage([]);

    expect(usage).toMatchObject({ today: null, monthTotal: null, averagePerDay: null, daysCounted: 0 });
  });

  it("keeps the busiest day, so the bars have something to scale against", () => {
    expect(readSourceUsage(days(10, 45, 30)).busiestDay).toBe(45);
    expect(readSourceUsage(days(null, null)).busiestDay).toBeNull();
  });
});
