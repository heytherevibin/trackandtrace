// Which drawing the page shows (spec §3.C), as pure logic: the train is drawn live unless a reason holds, and
// reasons come and go. drawing.ts runs it on the page.

export const DRAWING_REASONS = ["motion", "saver", "webgl", "quality", "load", "fit", "place"] as const;
export type DrawingReason = (typeof DRAWING_REASONS)[number];
export type DrawingMode = "live" | "still";
export type Reasons = ReadonlySet<DrawingReason>;

export function modeOf(reasons: Reasons): DrawingMode {
  return reasons.size > 0 ? "still" : "live";
}

export function withReason(reasons: Reasons, why: DrawingReason, holds: boolean): Reasons {
  const next = new Set(reasons);
  if (holds) next.add(why);
  else next.delete(why);
  return next;
}

/** <html data-drawing-why>: the reasons that hold, in the spec's order. */
export function whyOf(reasons: Reasons): string {
  return DRAWING_REASONS.filter((why) => reasons.has(why)).join(" ");
}

/** The reasons known when the journey starts: Motion off, Data Saver, this session's quality floor (tt.q), and a
 * reader already below the chapter (J5-2). */
export function startingReasons({ motion, saver, quality, place }: { readonly motion: boolean; readonly saver: boolean; readonly quality: string | null; readonly place: boolean }): Reasons {
  const reasons = new Set<DrawingReason>();
  if (!motion) reasons.add("motion");
  if (saver) reasons.add("saver");
  if (quality === "still") reasons.add("quality");
  if (place) reasons.add("place");
  return reasons;
}

/** Whether the scene may load now: nothing holds the drawing still but the reader's place, which clears by itself (J5-2). */
export function wantsScene(reasons: Reasons): boolean {
  return [...reasons].every((why) => why === "place");
}

export type ReaderPlace = "above" | "inside" | "past";

/**
 * Where the reader stands against a piece of the page about to change height (J5-3; shared since J6-4 by the live
 * drawing's pin, 02's dial, the still's columns and the run), from its box in window coordinates:
 * - above it while its top is visible, or within 8px above: a change lands below them;
 * - inside it while over half the window is still in it;
 * - past it once its foot is within the window's top half: what follows it is what they are reading.
 */
export function readerPlace(box: { readonly top: number; readonly bottom: number }, viewport: number): ReaderPlace {
  if (box.top >= -8) return "above";
  return box.bottom > viewport * 0.5 ? "inside" : "past";
}

/** The move that keeps a reader past a piece on what follows it when its height changes by `change`; 0 for anyone else. */
export function pastShift(before: { readonly top: number; readonly bottom: number }, change: number, viewport: number): number {
  return Math.abs(change) > 1 && readerPlace(before, viewport) === "past" ? change : 0;
}

/** Whether a change to a piece keeps its shape: "same" for a resize or a relayout (a window resized or zoomed, a phone
 * turned), "changed" for a change of what it is (Motion off or on, a pin or an unpin, the live drawing to the still, the
 * run failing to fit). The owner's rule, 2026-09-29. */
export type Shape = "same" | "changed";

/**
 * Where the reader belongs once a piece changed height under them (J5-3), or null to stay put:
 * - above it: the change lands below them;
 * - inside it: the same fraction through it when its shape is the same (placeInProportion; `viewportAfter` is the window
 *   a resize made), else its start, under the masthead;
 * - past it: moved by exactly the change, so what they read stays put.
 * Both boxes are in window coordinates against `scrollY`.
 */
export function placeAfter(
  before: { readonly top: number; readonly bottom: number; readonly height: number },
  after: { readonly top: number; readonly height: number },
  { scrollY, viewport, viewportAfter = viewport, masthead }: { readonly scrollY: number; readonly viewport: number; readonly viewportAfter?: number; readonly masthead: number },
  shape: Shape = "changed",
): number | null {
  const change = after.height - before.height;
  if (Math.abs(change) <= 1) return null;
  const where = readerPlace(before, viewport);
  if (where === "above") return null;
  if (where === "past") return Math.round(scrollY + change);
  if (shape === "changed") return Math.round(after.top + scrollY - masthead);
  return placeInProportion(
    { top: before.top + scrollY, bottom: before.bottom + scrollY, landing: masthead, viewport },
    { top: after.top + scrollY, bottom: after.top + after.height + scrollY, landing: masthead, viewport: viewportAfter },
    scrollY,
  );
}

/** A piece as a reader scrolls through it: its box in the page (document coordinates), how far below the window's top
 * its start lands (the masthead's foot, or its own scroll-margin-top), and the height of the window it is read in. */
export interface Reach {
  readonly top: number;
  readonly bottom: number;
  readonly landing: number;
  readonly viewport: number;
}

/**
 * Where a reader inside a piece lands when a resize changed it without changing its shape (the owner, 2026-09-29): the
 * same fraction of the way through it. Its range runs from its start (its top at its landing) to its foot at the
 * window's foot; for a pinned piece that fraction is its animation's progress, so the same chapter and frame come back.
 * - Beyond the range's end (its foot already in the window): the same distance from that foot, never short of its start.
 * - A piece no taller than its window, before or after, has no range to be a fraction of: its start, as a change of
 *   shape lands a reader (placeAfter).
 */
export function placeInProportion(before: Reach, after: Reach, scrollY: number): number {
  const start = before.top - before.landing;
  const range = before.bottom - before.viewport - start;
  const to = after.top - after.landing;
  const reach = after.bottom - after.viewport - to;
  if (range <= 0 || reach <= 0) return Math.round(to);
  if (scrollY > start + range) return Math.round(Math.max(to, after.bottom - (before.bottom - scrollY)));
  const f = Math.min(1, Math.max(0, (scrollY - start) / range));
  return Math.round(to + f * reach);
}
