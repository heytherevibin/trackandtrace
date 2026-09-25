// The journey's timing, from prototype v3's tokens.js. Durations and staggers in ms. Eases are the app's own
// curves (tokens.css), read live by ease.ts; CURVES is only the fallback when a property is missing.

export const T = { fast: 180, base: 420, slow: 760, draw: 1100 } as const;
export const STAGGER = { char: 16, row: 60, tick: 4, seg: 40, flap: 22 } as const;
/** onScroll's sync for scroll-driven values: how far they trail the scroll (v3's "smooth"). */
export const SMOOTH = 0.55;

export type Curve = readonly [number, number, number, number];

export const CURVES = {
  "--ease-out": [0.25, 1, 0.5, 1],
  "--ease-out-expo": [0.16, 1, 0.3, 1],
  "--ease-in": [0.5, 0, 0.75, 0],
  "--ease-in-out": [0.76, 0, 0.24, 1],
} as const satisfies Record<string, Curve>;

export type CurveToken = keyof typeof CURVES;

/** The four numbers of a computed `cubic-bezier(…)`, or the token's fallback. */
export function parseCurve(raw: string, token: CurveToken): Curve {
  const nums = /cubic-bezier\(([^)]+)\)/.exec(raw)?.[1]?.split(",").map((n) => Number(n.trim()));
  if (nums && nums.length === 4 && nums.every(Number.isFinite)) return [nums[0]!, nums[1]!, nums[2]!, nums[3]!];
  return CURVES[token];
}
