// When the rail clack sounds (prototype v3's sound.js): once per 120px scrolled, never within 80ms of the last,
// louder the faster the page moves. Silent when the page stops, because nothing else ever sounds it. Pure.

export interface Pace {
  readonly travelled: number;
  readonly lastClack: number;
}

export const START_PACE: Pace = { travelled: 0, lastClack: -Infinity };

export function paceStep(pace: Pace, dy: number, now: number, speed: number): { readonly pace: Pace; readonly level: number | null } {
  const travelled = pace.travelled + Math.abs(dy);
  if (travelled >= 120 && now - pace.lastClack > 80) return { pace: { travelled: 0, lastClack: now }, level: Math.min(0.32, 0.06 + speed * 0.12) };
  return { pace: { travelled, lastClack: pace.lastClack }, level: null };
}
