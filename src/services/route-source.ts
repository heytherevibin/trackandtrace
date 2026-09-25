import type { SourceFailure } from "./sources/outcome";

// ---------------------------------------------------------------------------
// The trains-on-a-route seam: given two station codes, which trains run between
// them. It exists because availability cannot be asked without one.
//
// Probed 2026-09-25: no endpoint turns a train number into a route. `/trains/:no`
// and `/trains/search` return a number and a name and nothing else; `/route/:no`,
// `/schedule/:no` and `/station/:code` are not there at all. So a traveller who
// knows only a train cannot be served, and this seam — the station pair — is the
// only way to reach `AvailabilityRequest`, which needs `from` and `to`.
//
// The rule it inherits from `AvailabilitySource`: **an empty list is an answer,
// a refusal is not.** "No trains run SBC → XXXX" and "we could not ask" are
// different things, and the traveller acts differently on each. `trains: []` is
// therefore a perfectly good `ok: true`, and no failure branch carries a list.
// ---------------------------------------------------------------------------

export interface RouteRequest {
  readonly from: string; // station code
  readonly to: string; // station code
}

/**
 * One train on the asked-for pair.
 *
 * `fromCode`/`toCode` are the SEGMENT asked about; `originCode`/`destinationCode`
 * are where the train itself starts and ends, which are often different and are
 * what a traveller recognises the train by ("the Bengaluru one").
 *
 * `runningDays` is the provider's own seven-character mask, kept verbatim.
 * `runsOn` is that mask read as seven flags — and **which flag is which weekday
 * is not yet verified**: the probe that found this endpoint printed shapes, not
 * values. Nothing may name a weekday from `runsOn` until one real response has
 * been read. Until then it answers only "how many days a week", which needs no
 * calendar. A mask in an unrecognised form parses to null rather than a guess.
 */
export interface RouteTrain {
  readonly trainNo: string;
  readonly trainName: string;
  readonly fromCode: string;
  readonly fromName: string;
  readonly toCode: string;
  readonly toName: string;
  readonly originCode: string;
  readonly originName: string;
  readonly destinationCode: string;
  readonly destinationName: string;
  /** Local time at the boarding station, HH:MM, or null when the provider gives no usable value. */
  readonly departs: string | null;
  readonly arrives: string | null;
  /** The provider's own duration text, verbatim; never re-derived from the two times. */
  readonly travelTime: string | null;
  readonly runningDays: string | null;
  readonly runsOn: readonly boolean[] | null;
  readonly halts: number | null;
  readonly distanceKm: number | null;
}

export interface RouteAnswer {
  readonly from: string;
  readonly to: string;
  readonly trains: readonly RouteTrain[];
  readonly retrievedAt: string;
}

export type RouteOutcome = { readonly ok: true; readonly answer: RouteAnswer } | SourceFailure;

export interface RouteSource {
  check(request: RouteRequest): Promise<RouteOutcome>;
}
