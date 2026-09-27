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

/**
 * Where the reader belongs once the chapter changed height under them (J5-3), or null to stay put:
 * - its top is visible, or below: the change lands below them;
 * - inside it (its top gone above, over half the window still in it): its start, under the masthead;
 * - past it (its bottom within the window's top half): moved by exactly the change, so what they read stays put.
 */
export function placeAfter(
  before: { readonly top: number; readonly bottom: number; readonly height: number },
  after: { readonly top: number; readonly height: number },
  { scrollY, viewport, masthead }: { readonly scrollY: number; readonly viewport: number; readonly masthead: number },
): number | null {
  const change = after.height - before.height;
  if (Math.abs(change) <= 1 || before.top >= -8) return null;
  if (before.bottom > viewport * 0.5) return Math.round(after.top + scrollY - masthead);
  return Math.round(scrollY + change);
}
