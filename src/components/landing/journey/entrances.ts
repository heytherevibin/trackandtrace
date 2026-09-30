// Entrances play once per load (the owner, 2026-09-30, reverting 2026-09-25's replay): the section entrances and the
// berth plan. Each is decided from its trigger's live box on every check, so a jump or a reload never strands anything:
// rest (the server's still state, before the first check) → "start" if any of the trigger is in the window then: it
// plays right then, at load, like the headline (the owner, 2026-09-30, after seeing a blank board peeking in at a
// desktop window's foot); otherwise armed → played the first time it enters the band, from either side. Played never
// arms again.

export type EntrancePhase = "rest" | "armed" | "played";
/** "start": arm and play at once (visible when the journey starts); "arm": put the start state on, out of sight;
 * "play": animate an armed trigger to rest. */
export type EntranceStep = "arm" | "start" | "play" | null;

export interface EntranceBox {
  readonly top: number;
  readonly bottom: number;
}

/** Any of the trigger is in the window. */
export function visible(box: EntranceBox, viewportHeight: number): boolean {
  return box.bottom > 0 && box.top < viewportHeight;
}

/** Any of the trigger has come into the band, the middle of the window from 1 − at to at of its height. */
export function inBand(box: EntranceBox, viewportHeight: number, at: number): boolean {
  return box.top < viewportHeight * at && box.bottom > viewportHeight * (1 - at);
}

export function entranceStep(phase: EntrancePhase, box: EntranceBox, viewportHeight: number, at: number): EntranceStep {
  if (phase === "played") return null;
  if (phase === "rest") return visible(box, viewportHeight) ? "start" : "arm";
  return inBand(box, viewportHeight, at) ? "play" : null;
}

/** Where a step leaves an entrance: armed after "arm"; played for good after "start" or "play". */
export function phaseAfter(step: NonNullable<EntranceStep>): EntrancePhase {
  return step === "arm" ? "armed" : "played";
}
