// Which drawing the page shows (spec §3.C), as pure logic: the train is drawn live unless a reason holds, and
// reasons come and go. drawing.ts runs it on the page. Since the journey was cut down to the terminus (2026-10-18)
// there is no pinned chapter to fit or to wait below, so only the reader's settings, the GPU, its pace and the
// scene's arrival hold it still.

export const DRAWING_REASONS = ["motion", "saver", "webgl", "quality", "load"] as const;
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

/** Whether the scene may load now: nothing holds the drawing still. */
export function wantsScene(reasons: Reasons): boolean {
  return reasons.size === 0;
}
