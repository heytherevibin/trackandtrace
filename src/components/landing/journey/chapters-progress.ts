// 02's scroll progress (prototype v3's chapters.js), pure: which stop, how far into it, and the demo's drawing.

export interface ChapterPlace {
  readonly i: 0 | 1 | 2;
  readonly t: number;
}

export function chapterAt(p: number): ChapterPlace {
  const i = Math.min(2, Math.max(0, Math.floor(p * 3))) as 0 | 1 | 2;
  return { i, t: Math.min(1, Math.max(0, p * 3 - i)) };
}

/** Digits typed into stop 01's demo: all ten by four fifths of the way. */
export function typedCount(t: number): number {
  return Math.min(10, Math.floor(t * 12.5));
}

/** Stop 02's seventeen request bars, rippling as the stop plays. */
export function barWidth(k: number, t: number): number {
  const w = 240 * (0.18 + 0.82 * Math.abs(Math.sin(k * 0.55 + t * 9))) * (1 - Math.abs(k - 8) / 11);
  return Math.round(w * 10) / 10;
}

/** Stop 02's step dots light as the pulse passes them: validate, source, result. */
export function stepLit(k: number, t: number): boolean {
  return t >= k / 2 - 0.02;
}
