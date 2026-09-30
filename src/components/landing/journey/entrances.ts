// Entrances, decided from the trigger's live box on every check, so a jump or a reload never strands anything: rest
// (the server's still state) → armed only once the trigger has wholly left the window → played when it comes into the
// band, from either side.
//
// Two kinds (spec §3.A):
// - The section entrances play once per load (the owner, 2026-09-30, reverting 2026-09-25's replay): a trigger in
//   the window when the watch starts is "seen", left as the server drew it; one out of sight arms and plays the first
//   time it reaches the band. Either way it ends "played", which never arms again.
// - The berth plan replays: after it plays it goes back to rest, and arms again once it has wholly left the window.

export type EntrancePhase = "rest" | "armed" | "played";
export type EntranceStep = "arm" | "play" | "seen" | null;

export interface EntranceBox {
  readonly top: number;
  readonly bottom: number;
}

export function entranceStep(phase: EntrancePhase, box: EntranceBox, viewportHeight: number, at: number, once = false): EntranceStep {
  if (phase === "played") return null;
  if (phase === "rest") {
    if (box.bottom <= 0 || box.top >= viewportHeight) return "arm";
    return once ? "seen" : null;
  }
  return box.top < viewportHeight * at && box.bottom > viewportHeight * (1 - at) ? "play" : null;
}

/** Where a step leaves an entrance: armed after "arm"; after "play" or "seen", played for good if it plays once,
 * else back at rest. */
export function phaseAfter(step: NonNullable<EntranceStep>, once: boolean): EntrancePhase {
  if (step === "arm") return "armed";
  return once ? "played" : "rest";
}
