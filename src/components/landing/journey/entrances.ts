// Section entrances that replay (spec §3.A, decided 2026-09-25), decided from the trigger's live box on every
// check, so a jump or a reload never strands anything: rest (the server's still state) → armed only once the
// trigger has wholly left the window → played when it comes back into the band, from either side.

export type EntrancePhase = "rest" | "armed";
export type EntranceStep = "arm" | "play" | null;

export interface EntranceBox {
  readonly top: number;
  readonly bottom: number;
}

export function entranceStep(phase: EntrancePhase, box: EntranceBox, viewportHeight: number, at: number): EntranceStep {
  if (phase === "rest") return box.bottom <= 0 || box.top >= viewportHeight ? "arm" : null;
  return box.top < viewportHeight * at && box.bottom > viewportHeight * (1 - at) ? "play" : null;
}
