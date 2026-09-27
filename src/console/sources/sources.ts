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

export interface SourceUsage {
  /** The last day in the list, or null when that day could not be read. */
  readonly today: number | null;
  /** Summed over the readable days only. Null when none were readable. */
  readonly monthTotal: number | null;
  readonly averagePerDay: number | null;
  /** How many days went into the two figures above — the honest denominator. */
  readonly daysCounted: number;
  /** The tallest bar, so the chart has something to scale against. */
  readonly busiestDay: number | null;
}

export function readSourceUsage(history: readonly UsageDay[]): SourceUsage {
  const known = history.filter((d): d is UsageDay & { requests: number } => d.requests !== null);
  const last = history.at(-1);
  if (known.length === 0) {
    return { today: null, monthTotal: null, averagePerDay: null, daysCounted: 0, busiestDay: null };
  }
  const total = known.reduce((sum, d) => sum + d.requests, 0);
  return {
    today: last?.requests ?? null,
    monthTotal: total,
    averagePerDay: Math.round(total / known.length),
    daysCounted: known.length,
    busiestDay: Math.max(...known.map((d) => d.requests)),
  };
}
