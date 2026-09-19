import type { Kv } from "./kv";

// Daily request counts per provider, for quota tracking: counts only, never a PNR.
// Days follow India, where the product and its operators are.

export const USAGE_TTL_MS = 40 * 24 * 60 * 60 * 1000;

const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

export function usageKey(prefix: string, source: string, at: Date): string {
  return `${prefix}:usage:${source}:${IST_DAY.format(at)}`;
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
