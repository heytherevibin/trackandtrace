import type { DrawingMode, DrawingReason } from "./drawing-mode";

// The landing journey's window events (spec 2026-09-24 §3.B). Names and details only, so the plates, the loader
// and the journey chunk share them without importing each other.

/** Something moved the page's layout (a morph, fonts, a resize): scroll-driven pieces re-measure. */
export const LAYOUT_EVENT = "tt:layout";
/** The drawing switched live ⇄ still, or its reasons changed. */
export const DRAWING_EVENT = "tt:drawing";
/** The strip reached another station. */
export const STATION_EVENT = "tt:station";
/** A piece's fit changed (chapters pinned ⇄ static): the whole journey rebuilds around it. */
export const REBUILD_EVENT = "tt:rebuild";
/** A check plate repainted: how many digits it holds, and whether it is running. */
export const PLATE_EVENT = "tt:plate";
/** A check plate started a request. */
export const RUN_EVENT = "tt:run";
/** A check plate shows a result: its kind, and the record's own chart time when the source sent one. */
export const RESULT_EVENT = "tt:result";

export interface StationDetail {
  readonly index: number;
}
export interface PlateDetail {
  readonly hero: boolean;
  readonly digits: number;
  readonly running: boolean;
  /** The plate is showing a result (its phase is "done"). */
  readonly done: boolean;
}
export interface RunDetail {
  readonly hero: boolean;
}
export interface ResultDetail {
  readonly hero: boolean;
  readonly kind: string;
  readonly chartAt: string | null;
}
export interface DrawingDetail {
  readonly mode: DrawingMode;
  readonly reasons: readonly DrawingReason[];
}

export function emit<T>(name: string, detail?: T): void {
  window.dispatchEvent(new CustomEvent<T | undefined>(name, { detail }));
}
