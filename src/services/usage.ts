import type { Kv } from "./kv";

// Daily request counts per provider, for quota tracking: counts only, never a PNR.
// Days follow India, where the product and its operators are.

export const USAGE_TTL_MS = 40 * 24 * 60 * 60 * 1000;

const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

/** The date in India, e.g. "2026-09-19". */
export function istDate(at: Date): string {
  return IST_DAY.format(at);
}

export function usageKey(prefix: string, source: string, at: Date): string {
  return `${prefix}:usage:${source}:${istDate(at)}`;
}

/** Counts one provider request. A failure to count is swallowed: it must never block a check. */
export function createUsageCounter(kv: Kv, prefix: string, now: () => Date = () => new Date()): (source: string) => Promise<void> {
  return async (source) => {
    try {
      await kv.incr(usageKey(prefix, source, now()), USAGE_TTL_MS);
    } catch {
      // Counting is best-effort.
    }
  };
}

/** One day's count, or null when the store could not say. */
export interface UsageDay {
  readonly day: string;
  readonly requests: number | null;
}

/** The most days `readUsageHistory` can answer for: beyond the counter's own TTL the keys are gone. */
export const USAGE_HISTORY_MAX_DAYS = Math.floor(USAGE_TTL_MS / 86_400_000);

/**
 * Reads back what `createUsageCounter` has been writing: one day per key, oldest first, in India's
 * days. Nothing new is recorded here — this is the read that was never written.
 *
 * **A missing key is a zero; a key that could not be read is not.** "Nobody asked that day" and "we
 * cannot say" are different facts, and only the first belongs in a total. The sheet draws the second
 * as a dashed "No data" box rather than a bar of height nothing, which it can only do if they arrive
 * here already told apart.
 *
 * `days` is clamped to the counter's own TTL. Asking for sixty would read twenty days of guaranteed
 * absence and draw them as zeroes — a chart of a quiet month that never happened.
 */
export async function readUsageHistory(
  kv: Kv,
  prefix: string,
  source: string,
  days: number,
  now: () => Date = () => new Date(),
): Promise<readonly UsageDay[]> {
  const span = Math.max(1, Math.min(Math.floor(days), USAGE_HISTORY_MAX_DAYS));
  const at = now().getTime();
  const wanted = Array.from({ length: span }, (_, i) => new Date(at - (span - 1 - i) * 86_400_000));
  return Promise.all(
    wanted.map(async (when) => {
      const day = istDate(when);
      try {
        const raw = await kv.get(usageKey(prefix, source, when));
        if (raw === null) return { day, requests: 0 };
        // A stored value that is not a whole count was not written by the counter, and a number
        // drawn from a misreading is worse than an admitted absence. The digits are checked as TEXT
        // first: `Number("")` is 0, so an empty value would otherwise read as a real count of none.
        return { day, requests: /^\d+$/.test(raw.trim()) ? Number(raw) : null };
      } catch {
        return { day, requests: null };
      }
    }),
  );
}
