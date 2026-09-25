// Status colour, in one place because two surfaces draw it: the four-date chart and the route
// list's class blocks. Restating the rule beside each would let them drift, and a colour that
// disagreed with itself across two plates would be worse than no colour at all.

export interface StatusTone {
  /** The chip's fill and ink. */
  readonly chip: string;
  /** The bare waitlist figure beside it, on the page ground rather than the chip. */
  readonly figure: string;
}

const OPEN: StatusTone = { chip: "bg-open-soft text-open-soft-ink", figure: "text-open-soft-ink" };
const QUEUED: StatusTone = { chip: "bg-queued-soft text-queued-soft-ink", figure: "text-queued-soft-ink" };
const CLOSED: StatusTone = { chip: "bg-closed-soft text-closed-soft-ink", figure: "text-closed-soft-ink" };

/**
 * Only an explicit AVAILABLE is green. Anchored, because `NOT AVAILABLE` contains the word — the
 * same trap `AVAILABLE_COUNT` is anchored against in the parser, and for the same reason.
 */
const SAYS_AVAILABLE = /^AVAILABLE\b/i;

/**
 * Keyed to what the source SAID, and to nothing else.
 *
 * `canBook` outranks the status word: a day the source will not sell is closed however it is
 * labelled, so AVAILABLE with `canBook: false` must not read as an open berth.
 *
 * Below that, green has to be earned. An earlier rule inferred the queue from the presence of a
 * parsed FIGURE — `wlCurrent !== null` — and everything else fell through to green. But
 * `splitRawStatus` returns nulls for every form that is not a `nn/nn` pair, and says so out loud:
 * that is normal, not a parse failure. So the absence of a number is no evidence at all about
 * whether there is a queue, and production proved it on 2026-09-26, drawing 16159 MAS → SRR as
 * three GREEN waitlists beside 12601's three amber ones.
 *
 * Inverting it makes the unknown case safe: RAC is a seat in a queue, a waitlist whose raw form we
 * cannot split is still a waitlist, and a status this app has never seen is not an open berth.
 * Green is the one direction that must never fail, because green is the one a traveller acts on.
 *
 * A queue is a queue at any length. A waitlist of 9 and a waitlist of 148 wear the same amber,
 * because a colour that eased towards green as the queue shortened would be a prediction, and this
 * product does not make one. The figure beside the chip does the ranking.
 */
export function statusTone(day: { readonly canBook: boolean; readonly wlCurrent: number | null; readonly status: string }): StatusTone {
  if (!day.canBook) return CLOSED;
  return SAYS_AVAILABLE.test(day.status.trim()) ? OPEN : QUEUED;
}
