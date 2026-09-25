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
 * Keyed to what the source said, and to nothing else.
 *
 * `canBook` outranks the status word: a day the source will not sell is closed however it is
 * labelled, so AVAILABLE with `canBook: false` must not read as an open berth.
 *
 * Below that, a queue is a queue. A waitlist of 9 and a waitlist of 148 wear the same amber,
 * because a colour that eased towards green as the queue shortened would be a prediction, and this
 * product does not make one. The figure beside the chip does the ranking.
 */
export function statusTone(day: { readonly canBook: boolean; readonly wlCurrent: number | null }): StatusTone {
  if (!day.canBook) return CLOSED;
  if (day.wlCurrent !== null) return QUEUED;
  return OPEN;
}
