// Where the strip's train stands (prototype v3's strip.js), from the scroll and the stations' boxes. Pure.

export interface StripPlace {
  /** The station the page has reached. */
  readonly i: number;
  /** How far towards the next, 0–1. */
  readonly f: number;
}

/** Each station's top in page px, reached a third of a window early (`bias`); the first is 0, and each is
 * at least 1px past the last, so the table always rises. */
export function stationTops(anchors: readonly number[], bias: number): readonly number[] {
  return anchors.reduce<readonly number[]>((tops, anchor, k) => [...tops, k === 0 ? 0 : Math.max(anchor - bias, tops[k - 1]! + 1)], []);
}

export function stripPlace(tops: readonly number[], y: number): StripPlace {
  const last = tops.length - 1;
  const passed = tops.findLastIndex((top, k) => k <= last && y >= top);
  const i = Math.max(0, passed);
  if (i >= last) return { i: last, f: 0 };
  return { i, f: Math.min(1, Math.max(0, (y - tops[i]!) / (tops[i + 1]! - tops[i]!))) };
}

/** 0 at DEP, 1 at END. */
export function stripFraction({ i, f }: StripPlace, count: number): number {
  return (i + f) / (count - 1);
}

/** The phone rail's train, as its `left` percentage within one track, clamped so the glyph (centred by CSS `translateX(-50%)`)
 * never hangs past either edge at DEP or END — the phone rail runs edge to edge, with nothing past it to
 * absorb the overhang. `trackWidth <= 0` (not yet measured) skips the clamp rather than dividing by zero. */
export function trainLeft(fraction: number, glyphWidth: number, trackWidth: number): number {
  if (trackWidth <= 0) return fraction * 100;
  const halfPercent = (glyphWidth / 2 / trackWidth) * 100;
  return Math.min(Math.max(fraction * 100, halfPercent), 100 - halfPercent);
}

/** The rail's train, as its glyph's top in px down one track: centred on the stop it has reached, where each
 * stop's box stands (`trackHeight - stopHeight`) × fraction down (stations.ts `stopTop`), and clamped so the glyph
 * never hangs past either end. `trackHeight <= 0` (not yet measured, or the rail not shown) stands it at the top. */
export function trainTop(fraction: number, glyphHeight: number, trackHeight: number, stopHeight: number): number {
  if (trackHeight <= 0) return 0;
  const centre = stopHeight / 2 + (trackHeight - stopHeight) * fraction;
  return Math.min(Math.max(centre - glyphHeight / 2, 0), Math.max(0, trackHeight - glyphHeight));
}

export function odometer({ i, f }: StripPlace, kms: readonly number[]): number {
  const here = kms[i]!;
  const next = kms[Math.min(i + 1, kms.length - 1)]!;
  return Math.round(here + (next - here) * f);
}

/** One frame of lean, in degrees: against the scroll (`velocity` px per frame), at most 10°, closing 18% of the
 * gap each frame, and exactly upright once it has settled. */
export function leanStep(lean: number, velocity: number): number {
  const target = Math.max(-10, Math.min(10, -velocity * 0.35));
  const next = lean + (target - lean) * 0.18;
  return velocity === 0 && Math.abs(next) < 0.05 ? 0 : next;
}
