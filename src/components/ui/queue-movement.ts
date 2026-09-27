// How far a queue has already drained, read from the one string the source gives us.
//
// **Why this can exist at all without any stored history.** A waitlist pair is not one number twice:
// `GNWL65/WL26` says the next booking is ISSUED at position 65 and CURRENTLY stands 26th, so 39 of
// the 65 ahead of it have already gone. That is movement, measured, inside a single response — which
// is the only reason this works for a train nobody has ever crawled. The observation store covers
// twelve combos; travellers search everything. A surface that needed cross-day history would read
// "no history yet" for essentially every real search, and the store is not the thing that makes this
// possible.
//
// **The case this module is really for.** `GNWL5/RAC48` is issued at general waitlist 5 and now
// standing at RAC 48 — a BETTER state, a shared seat rather than none. The two numbers are not on
// one scale, and subtracting them gives −43 "cleared". Four rows in the live store carry that form,
// and a naive difference would have drawn a negative on the page. Every branch below exists because
// the forms were counted first, on 2026-09-27 across 433 rows:
//
//   156 × GNWLn/WLn      108 × PQWLn/WLn      27 × RLWLn/WLn       7 × TQWLn/WLn
//    37 × AVAILABLE-n     30 × NOT AVAILABLE  27 × REGRET         11 × TRAIN DEPARTED
//     9 × RAC  n/RAC  n    4 × GNWLn/RACn      4 × CLASS NOT EXIST 3 × AVAILABLE-n#
//     2 × CURR_AVBL-n      2 × PQWL/AVAILABLE  1 × CHARTING DONE *
//
// **This is not a prediction and must not become one.** It reports what has already happened to a
// queue. Nothing here says whether the remaining places will clear, and no branch may ever infer
// that: the moment a shortening queue implies an outcome, this becomes the estimate the site
// promises not to make. `statusTone` refuses the same temptation for the same reason.

/** A queue that has drained some of the places issued ahead of it. `cleared` is never negative. */
export interface QueueDrained {
  readonly kind: "drained";
  /** The booking position the next ticket is issued at: where the queue opened. */
  readonly opened: number;
  /** Where that position now stands. */
  readonly now: number;
  /** `opened − now`: places already gone. Zero is a real reading, not an absence. */
  readonly cleared: number;
}

/** A position that has moved into a better queue, where a difference would be meaningless. */
export interface QueueImproved {
  readonly kind: "improved";
  readonly to: "RAC";
  readonly now: number;
}

/** The queue is gone and berths are free — no figure to report, and the best outcome a queue has. */
export interface QueueClearedOut {
  readonly kind: "cleared-out";
}

export type QueueMovement = QueueDrained | QueueImproved | QueueClearedOut;

/**
 * The two halves, each with its own prefix kept. `RAC` spacing varies in the real data (`RAC  58`
 * with two spaces, `RAC   9` with three), so whitespace is matched rather than assumed, exactly as
 * the parser's own `WAITLIST_PAIR` does.
 */
const PAIR = /^([A-Z]{0,6}WL|RAC)\s*(\d{1,5})\s*\/\s*([A-Z]{0,6}WL|RAC)?\s*(\d{1,5})$/i;

/** `PQWL/AVAILABLE`: a prefix, no figure, and the word. Anchored so `NOT AVAILABLE` cannot match. */
const CLEARED_OUT = /^[A-Z]{0,6}WL\s*\/\s*AVAILABLE$/i;

/** RAC is a seat shared rather than none, so it ranks above any waitlist. */
function rank(prefix: string): number {
  return /RAC/i.test(prefix) ? 1 : 0;
}

export function queueMovement(rawStatus: string): QueueMovement | null {
  const raw = rawStatus.trim();
  if (raw === "") return null;
  if (CLEARED_OUT.test(raw)) return { kind: "cleared-out" };

  const match = PAIR.exec(raw);
  if (!match) return null;
  const [, openedPrefix, openedFigure, nowPrefix, nowFigure] = match;
  if (!openedPrefix || !openedFigure || !nowFigure) return null;

  const opened = Number(openedFigure);
  const now = Number(nowFigure);
  // An absent second prefix repeats the first: `GNWL65/WL26` and `RAC 58/RAC 51` are both same-queue,
  // and `…/WL26` after a `…WL` prefix is the same queue spelled shorter.
  const nowRank = nowPrefix === undefined || nowPrefix === "" ? rank(openedPrefix) : rank(nowPrefix);
  const openedRank = rank(openedPrefix);

  if (nowRank > openedRank) return { kind: "improved", to: "RAC", now };
  // A held position cannot degrade — cancellations move a queue one way only — so a pair claiming it
  // did is one this app has misread, and the honest answer is to say nothing at all.
  if (nowRank < openedRank) return null;
  // Same queue, and still guarded: a difference that comes out negative means the reading is not what
  // this function thinks it is, and a negative "already cleared" is worse than no figure.
  if (now > opened) return null;
  return { kind: "drained", opened, now, cleared: opened - now };
}
