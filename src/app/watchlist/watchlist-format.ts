import { messages } from "@/messages";
import type { HistoryPoint, WatchlistEntry } from "@/types/domain";
import { statusLabel } from "@/utils/status-tone";

// Pure readings of a saved entry, as the Watchlist sheet prints them.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const TREND_POINTS = 3;

export function lastCheck(entry: WatchlistEntry): HistoryPoint | null {
  return entry.checks[entry.checks.length - 1] ?? null;
}

/** Waitlist positions read as bare figures ("11 → 8 → 5"); every other point keeps its label ("RAC 4"). */
function pointLabel(point: HistoryPoint): string {
  return point.status === "WL" && typeof point.position === "number" ? String(point.position) : statusLabel(point.status, point.position);
}

/** The movement across saved checks, or null when fewer than two distinct points exist. */
export function trendLabel(checks: readonly HistoryPoint[]): string | null {
  const distinct = checks.filter((point, i) => {
    const previous = checks[i - 1];
    return !previous || previous.status !== point.status || previous.position !== point.position;
  });
  if (distinct.length < 2) return null;
  return distinct.slice(-TREND_POINTS).map(pointLabel).join(" → ");
}

/** "Just now", "12 min ago", "1 h ago", "Yesterday", "3 days ago". Clock skew reads as just now. */
export function checkedAgo(at: string, now: Date = new Date()): string {
  const m = messages.watchlist.checked;
  const diff = now.getTime() - new Date(at).getTime();
  if (diff < MINUTE_MS) return m.justNow;
  if (diff < HOUR_MS) return m.minutes(Math.floor(diff / MINUTE_MS));
  if (diff < DAY_MS) return m.hours(Math.floor(diff / HOUR_MS));
  if (diff < 2 * DAY_MS) return m.yesterday;
  return m.days(Math.floor(diff / DAY_MS));
}

/** A new list with the entry back at its old index (or at the end when the list has shrunk). */
export function restoreAt<T>(list: readonly T[], index: number, item: T): readonly T[] {
  const at = Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), item, ...list.slice(at)];
}
