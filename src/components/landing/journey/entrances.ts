// Entrances play once per load (the owner, 2026-09-30, reverting 2026-09-25's replay): the section entrances and the
// berth plan. Each is decided from its trigger's live box on every check, so a jump or a reload never strands anything:
// rest (the server's still state, before the first check) → "seen" if the trigger is properly in the band then, left as
// the server drew it; otherwise armed → played the first time it is properly in the band, from either side. Played
// never arms again.

export type EntrancePhase = "rest" | "armed" | "played";
export type EntranceStep = "arm" | "play" | "seen" | null;

export interface EntranceBox {
  readonly top: number;
  readonly bottom: number;
}

/**
 * Properly in the band (the middle of the window, from 1 − at to at of its height): at least half the trigger lies in
 * it, or half the band for a trigger taller than that. A trigger that only peeks in at the window's edge is not (the
 * owner, 2026-09-30: the departure board at a desktop window's foot, loaded at the top, plays when it is scrolled in).
 */
export function inBand(box: EntranceBox, viewportHeight: number, at: number): boolean {
  const low = viewportHeight * (1 - at);
  const high = viewportHeight * at;
  if (box.bottom < low || box.top > high) return false;
  const overlap = Math.min(box.bottom, high) - Math.max(box.top, low);
  return overlap >= Math.min(box.bottom - box.top, high - low) / 2;
}

export function entranceStep(phase: EntrancePhase, box: EntranceBox, viewportHeight: number, at: number): EntranceStep {
  if (phase === "played") return null;
  const inside = inBand(box, viewportHeight, at);
  if (phase === "rest") return inside ? "seen" : "arm";
  return inside ? "play" : null;
}

/** Where a step leaves an entrance: armed after "arm"; played for good after "play" or "seen". */
export function phaseAfter(step: NonNullable<EntranceStep>): EntrancePhase {
  return step === "arm" ? "armed" : "played";
}
