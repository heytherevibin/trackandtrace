import type { Kv } from "./kv";
import { istDate } from "./usage";

// The daily budget for live requests: every address together, per environment, counted per
// day in India. A provider's plan is monthly and finite, so one bad day must not spend the
// month. Past the budget no provider is asked: checks are answered from the cache or not at all.

export const BUDGET_TTL_MS = 2 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** India keeps UTC+05:30 all year. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export type BudgetVerdict = { readonly ok: true } | { readonly ok: false; readonly retryAfterSeconds: number };

export interface LiveBudget {
  /** Spends one live request, or says how long until the budget opens again. */
  take(): Promise<BudgetVerdict>;
}

export interface LiveBudgetOptions {
  readonly kv: Kv;
  /** e.g. "tt:production" */
  readonly prefix: string;
  /** Read on every request, so the limit can change during the day. */
  readonly limit: () => number;
  readonly now?: () => number;
  /** Called once a day, by one instance, when the budget first refuses. Never given a PNR or an address. */
  readonly onReached?: (info: { readonly day: string; readonly limit: number }) => void;
}

/** Seconds until the next midnight in India. */
export function secondsToIstMidnight(nowMs: number): number {
  const intoDay = (((nowMs + IST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS;
  return Math.ceil((DAY_MS - intoDay) / 1000);
}

/** For sources that spend no provider quota: the sample data and the unconnected live seam. */
export const UNLIMITED_BUDGET: LiveBudget = { take: async () => ({ ok: true }) };

export function createLiveBudget(options: LiveBudgetOptions): LiveBudget {
  const now = options.now ?? Date.now;
  const reported = new Set<string>();

  /** One report a day across every instance: the first to count the day's marker makes it. */
  async function report(day: string, limit: number): Promise<void> {
    if (reported.has(day)) return;
    reported.add(day);
    try {
      if ((await options.kv.incr(`${options.prefix}:budget:live:${day}:reached`, BUDGET_TTL_MS)) === 1) options.onReached?.({ day, limit });
    } catch {
      // Reporting is best-effort.
    }
  }

  return {
    async take() {
      const at = now();
      const day = istDate(new Date(at));
      const limit = options.limit();
      let used: number;
      try {
        used = await options.kv.incr(`${options.prefix}:budget:live:${day}`, BUDGET_TTL_MS);
      } catch {
        // A store that can't count never blocks a check; the shared store already falls back to this instance's memory.
        return { ok: true };
      }
      if (used <= limit) return { ok: true };
      await report(day, limit);
      return { ok: false, retryAfterSeconds: secondsToIstMidnight(at) };
    },
  };
}
