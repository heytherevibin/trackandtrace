import type { UsageDay } from "@/services/usage";

// The figures module 02 draws, shaped from the daily counter. Pure: a list in, a shape out, so the
// plate can be drawn from a fixture and this can be tested without a store.
//
// **A day the store could not read is not a zero, and it is not a divisor either.** An average over
// thirty days when four of them are unknown is not an average over thirty days — it is a quieter
// month than the one that happened, computed from days nobody can say anything about. So an unknown
// day is left out of the total AND out of the count it is divided by, and `daysCounted` says how
// many actually went in.
//
// A real zero is different and is counted: a quiet day is a day that happened.

/**
 * The primary source's plan (RailKit), a month. A constant: nothing reads the provider's plan back. Upgraded ten-fold on
 * 2026-09-26 (8ce0ed8), when the crawler's own copy of it was found still describing the old one.
 */
export const PRIMARY_MONTHLY_PLAN = 100_000;

export interface SourceUsage {
  /** The last day in the list, or null when that day could not be read. */
  readonly today: number | null;
  /** Summed over the readable days of the last day's CALENDAR month only. Null when none were readable. */
  readonly monthTotal: number | null;
  readonly averagePerDay: number | null;
  /** How many days went into the two figures above — the honest denominator. */
  readonly daysCounted: number;
  /** The tallest bar across every day drawn, so the chart has something to scale against. */
  readonly busiestDay: number | null;
}

type KnownDay = UsageDay & { requests: number };

const isKnown = (d: UsageDay): d is KnownDay => d.requests !== null;

/**
 * The plan resets on the 1st, so "this month" is the calendar month the last day falls in — not the
 * thirty days the chart draws, which on 2 October would count September against October's quota.
 * The month comes from the date string ("2026-10-02" → "2026-10"), so it is known even when today's
 * count is not.
 */
export function readSourceUsage(history: readonly UsageDay[]): SourceUsage {
  const last = history.at(-1);
  const drawn = history.filter(isKnown);
  const month = last?.day.slice(0, 7);
  const known = drawn.filter((d) => d.day.slice(0, 7) === month);
  const busiestDay = drawn.length === 0 ? null : Math.max(...drawn.map((d) => d.requests));
  if (known.length === 0) {
    return { today: null, monthTotal: null, averagePerDay: null, daysCounted: 0, busiestDay };
  }
  const total = known.reduce((sum, d) => sum + d.requests, 0);
  return {
    today: last?.requests ?? null,
    monthTotal: total,
    averagePerDay: Math.round(total / known.length),
    daysCounted: known.length,
    busiestDay,
  };
}
