// The dial's geometry, from prototype v3's dial.js: angles in degrees, clockwise from twelve o'clock, in a drawing
// centred on 0,0. Pure, so the server draws it and J3 animates the same shapes.

export type Point = readonly [number, number];

/** Rounded to 2dp: Math.cos/sin can differ in their last bit between the server's V8 and the browser's, and an
 * unrounded coordinate would carry that bit into the SSR-ed attribute, mismatching on hydration. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The digit groups of a PNR as a ticket prints it: 3-3-4. */
export const DIGIT_GROUPS = [3, 3, 4] as const;

export function polar(r: number, deg: number): Point {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

/** An SVG arc of radius r from one angle to another, clockwise. */
export function arcPath(r: number, from: number, to: number): string {
  const [x0, y0] = polar(r, from);
  const [x1, y1] = polar(r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export interface DigitArc {
  readonly from: number;
  readonly to: number;
  readonly group: number;
}

/** Ten equal segments, one per digit, in groups of 3-3-4 with a wider gap between groups. */
export function digitArcs({ start = -150, sweep = 300, groupGap = 9, digitGap = 1.6 }: { start?: number; sweep?: number; groupGap?: number; digitGap?: number } = {}): readonly DigitArc[] {
  const usable = sweep - groupGap * (DIGIT_GROUPS.length - 1) - digitGap * (10 - DIGIT_GROUPS.length);
  const each = usable / 10;
  return DIGIT_GROUPS.flatMap((count, group) => {
    const before = DIGIT_GROUPS.slice(0, group).reduce((sum, n) => sum + n, 0);
    const groupStart = start + before * each + (before - group) * digitGap + group * groupGap;
    return Array.from({ length: count }, (_, i) => {
      const from = groupStart + i * (each + digitGap);
      return { from, to: from + each, group };
    });
  });
}

export interface Tick {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly major: boolean;
}

/** The bezel: 120 ticks, 3° apart, every tenth a longer major tick. */
export function bezelTicks(): readonly Tick[] {
  return Array.from({ length: 120 }, (_, i) => {
    const major = i % 10 === 0;
    const [x1, y1] = polar(major ? 392 : 400, i * 3);
    const [x2, y2] = polar(412, i * 3);
    return { x1: round2(x1), y1: round2(y1), x2: round2(x2), y2: round2(y2), major };
  });
}

/** Where each digit group's label sits: at radius r, midway along that group's own arcs. */
export function groupLabelPoints(arcs: readonly DigitArc[], r: number): readonly Point[] {
  return DIGIT_GROUPS.map((_, group) => {
    const own = arcs.filter((arc) => arc.group === group);
    return polar(r, (own[0]!.from + own.at(-1)!.to) / 2);
  });
}
