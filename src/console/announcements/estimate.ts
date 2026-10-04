import type { LetterRow } from "@/console/announcements/letters";
import { ANNOUNCEMENT_CEILING } from "@/services/announcements/budget";

// How long a letter takes, said the way the sheet says it. One letter drains at a time, in queue
// order, at most ANNOUNCEMENT_CEILING a day (spec §3), so a letter's finish is its own wait plus the
// wait of everything queued before it. These are estimates and the copy says "about": a day that
// confirmation mail uses up sends nothing, and the finish moves later.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days at the daily ceiling, rounded to the nearest and never less than one while anything
 * waits. The sheet's samples round (165 waiting is "about 4 days"), and every line that shows this
 * number says "about".
 */
export function daysFor(waiting: number): number {
  return waiting <= 0 ? 0 : Math.max(1, Math.round(waiting / ANNOUNCEMENT_CEILING));
}

export interface Ahead {
  /** The letter that goes first. */
  readonly subject: string;
  /** How many other open letters are ahead besides that one. */
  readonly more: number;
  /** Days until all of them have gone. */
  readonly days: number;
}

/**
 * What a letter waits behind. For a draft (`queuedAt` null) that is every open letter; for a queued
 * one, only those queued before it. Null when nothing is ahead.
 */
export function lettersAhead(letters: readonly LetterRow[], of: { readonly id: string | null; readonly queuedAt: string | null }): Ahead | null {
  const open = letters
    .filter((l) => (l.state === "queued" || l.state === "sending") && l.id !== of.id && l.queuedAt !== null)
    .filter((l) => of.queuedAt === null || (l.queuedAt as string) < of.queuedAt)
    .toSorted((a, b) => (a.queuedAt as string).localeCompare(b.queuedAt as string));
  const first = open[0];
  if (!first) return null;
  return { subject: first.subject, more: open.length - 1, days: daysFor(open.reduce((sum, l) => sum + l.waiting, 0)) };
}

export function finishDate(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/** A whole percentage, 0 when there is nobody: never NaN in a style attribute. */
export function percent(handled: number, total: number): number {
  return total <= 0 ? 0 : Math.round((handled / total) * 100);
}
