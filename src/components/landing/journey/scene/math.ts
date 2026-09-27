// The drawn train's small maths (prototype v3's scene/util.js): clamping, blending and the cubic eases its poses
// use. No three.js here, so the poses stay pure and the tests need no scene.

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
