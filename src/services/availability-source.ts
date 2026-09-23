import type { SourceFailure } from "./sources/outcome";

// ---------------------------------------------------------------------------
// The seat-availability seam, asked before a ticket exists. It mirrors
// `PnrDataSource` deliberately: one `check`, one outcome, and a failure that may
// carry a server-only `cause` for the breaker and the retry policy which never
// reaches the wire.
//
// The rule the whole seam exists to keep: **a refusal is never an empty day
// list.** "We could not ask" and "there are no berths" are different answers,
// and on a booking-adjacent page a traveller acts on the second. So the failure
// branch has no `days` at all — there is no shape in which a provider refusal
// can be mistaken for a sold-out train. The reverse holds too: a real `REGRET`
// or `canBook: false` is an answer, and is returned as one.
//
// ISO dates cross every boundary here. A provider's own date format lives
// inside that provider's adapter and nowhere else.
// ---------------------------------------------------------------------------

export interface AvailabilityRequest {
  readonly trainNo: string; // 5 digits
  readonly from: string; // station code
  readonly to: string; // station code
  readonly journeyDate: string; // ISO yyyy-mm-dd at our boundary; DD-MM-YYYY only inside the adapter
  readonly travelClass: string; // SL, 3A, 2A, 1A, CC, EC, 2S
  readonly quota: string; // GN, TQ, LD, SS …
}

/** One dated answer, as spec §4.1 declares it: what any reader of the seam may rely on. */
export interface AvailabilityDay {
  readonly date: string; // ISO, normalised from the provider's form
  readonly status: string; // AVAILABLE | RAC | WL | REGRET | …
  readonly availabilityText: string; // the source's own short text
  readonly rawStatus: string; // verbatim, for the observation store
  readonly canBook: boolean;
}

/**
 * What an adapter actually returns for each day: the day above, plus the four
 * values the observation store records and **no page renders**.
 *
 * `wlBooking` / `wlCurrent` are the two halves of `rawStatus` (`GNWL65/WL26` is
 * booking-position waitlist 65, current waitlist 26) — where the queue started
 * and where it is now, which are the strongest features a clearance model gets
 * and arrive free in every observation. Both are null whenever `rawStatus` is
 * not a pair of waitlist numbers, which is a normal form, not an error.
 *
 * `prediction` / `predictionPercentage` are the *source's* own guess. They are
 * recorded privately as the baseline a Trakline model has to beat (spec D4/§6)
 * and are never shown: the live site promises confirmation odds are never
 * displayed, and showing someone else's as ours would be untrue twice over.
 * Do not "helpfully" surface them.
 */
export interface AvailabilityDayRecord extends AvailabilityDay {
  readonly wlBooking: number | null;
  readonly wlCurrent: number | null;
  readonly prediction: string | null;
  readonly predictionPercentage: number | null;
}

export interface AvailabilityAnswer {
  readonly train: { readonly no: string; readonly name: string; readonly fromName: string; readonly toName: string; readonly distanceKm: number };
  readonly fare: { readonly base: number; readonly reservation: number; readonly superfast: number; readonly gst: number; readonly total: number };
  readonly days: readonly AvailabilityDayRecord[];
  readonly retrievedAt: string;
}

/**
 * `{ ok: true, answer }` or the same failure shape every source uses, so the
 * breaker, the retry policy and the API error mapping read one taxonomy.
 */
export type AvailabilityOutcome = { readonly ok: true; readonly answer: AvailabilityAnswer } | SourceFailure;

export interface AvailabilitySource {
  /** Failures may carry a server-only `cause`; it never reaches the wire. */
  check(request: AvailabilityRequest): Promise<AvailabilityOutcome>;
}
