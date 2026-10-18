import type { DrawingMode, DrawingReason } from "./drawing-mode";

// The terminus drawing's window events (spec 2026-09-24 §3.B, cut down to the terminus on 2026-10-18). Names and
// details only, so the plates, the loader and the journey chunk share them without importing each other.

/** Something moved the page's layout (a morph, fonts, a resize): scroll-driven pieces re-measure. */
export const LAYOUT_EVENT = "tt:layout";
/** The drawing switched live ⇄ still, or its reasons changed. */
export const DRAWING_EVENT = "tt:drawing";
/** Rebuild the journey around a changed fit. */
export const REBUILD_EVENT = "tt:rebuild";
/** The live drawing's GPU context: "lost" (draw still) or "restored" (live again). Heard by drawing.ts, never by the
 * live module, which is torn down while the context is gone (v3's gotcha). */
export const WEBGL_EVENT = "tt:webgl";
export type WebglDetail = "lost" | "restored";
/** Redraw the live drawing in the current theme now: the live drawing re-reads its tokens and draws at once. Night
 * falls (J6) sends it inside its view transition, as journey.redrawNow() (J5-9). */
export const THEME_EVENT = "tt:theme";

export interface DrawingDetail {
  readonly mode: DrawingMode;
  readonly reasons: readonly DrawingReason[];
}

export function emit<T>(name: string, detail?: T): void {
  window.dispatchEvent(new CustomEvent<T | undefined>(name, { detail }));
}
