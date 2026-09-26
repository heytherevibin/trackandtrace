import type { SourceFailure } from "./sources/outcome";

// ---------------------------------------------------------------------------
// One train's whole run: every station it calls at, in order.
//
// A different question from `route-source.ts`, which answers "which trains run
// between these two stations". That one gives `halts` as a COUNT; this one gives
// the stops themselves.
//
// It costs one provider request per TRAIN, so it is never asked for a whole
// search — only for the train a reader opened. The timetable behind it changes a
// few times a year, which is what makes it worth caching hard.
// ---------------------------------------------------------------------------

export interface TrainRouteRequest {
  readonly trainNo: string;
}

/** One station on the run. */
export interface TrainStop {
  readonly code: string;
  readonly name: string;
  /**
   * Null at the origin, where the provider sends "--". A missing time is not a zero: an origin
   * that read 00:00 would be a departure in the middle of the night.
   */
  readonly arrival: string | null;
  /** Null at the terminus, for the same reason. */
  readonly departure: string | null;
  readonly haltMinutes: number | null;
  /** Kilometres from the ORIGIN, not from the traveller's boarding point. */
  readonly distanceKm: number | null;
  /** 1 on the day of departure, 2 the next morning, and so on. */
  readonly day: number | null;
  readonly platform: number | null;
}

export interface TrainRouteAnswer {
  readonly trainNo: string;
  readonly trainName: string;
  readonly stops: readonly TrainStop[];
  readonly retrievedAt: string;
}

export type TrainRouteOutcome = { readonly ok: true; readonly answer: TrainRouteAnswer } | SourceFailure;

export interface TrainRouteSource {
  check(request: TrainRouteRequest): Promise<TrainRouteOutcome>;
}
