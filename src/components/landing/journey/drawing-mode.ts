// Which drawing the page shows (spec §3.C), as pure logic: the train is drawn live unless a reason holds, and
// reasons come and go. drawing.ts runs it on the page.

export const DRAWING_REASONS = ["motion", "saver", "webgl", "quality", "load", "fit"] as const;
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

/** The reasons known when the journey starts: Motion off, Data Saver, and this session's quality floor (tt.q). */
export function startingReasons({ motion, saver, quality }: { readonly motion: boolean; readonly saver: boolean; readonly quality: string | null }): Reasons {
  const reasons = new Set<DrawingReason>();
  if (!motion) reasons.add("motion");
  if (saver) reasons.add("saver");
  if (quality === "still") reasons.add("quality");
  return reasons;
}

/**
 * Whether switching the drawing should put the reader back at the chapter's start: they were inside it (its top gone
 * above the window, over half the window still in it), and the switch changed its height.
 */
export function keepsPlace(before: { readonly top: number; readonly bottom: number; readonly height: number }, height: number, viewport: number): boolean {
  return before.top < -8 && before.bottom > viewport * 0.5 && Math.abs(height - before.height) > 1;
}
