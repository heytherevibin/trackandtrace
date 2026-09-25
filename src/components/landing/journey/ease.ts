import { cubicBezier, type EasingFunction } from "animejs";
import { parseCurve, type CurveToken } from "./motion-tokens";

// Anime.js eases made from the app's own curve tokens, read once from the live CSS, so the journey eases
// exactly as the rest of the app does.

const made = new Map<CurveToken, EasingFunction>();

function curve(token: CurveToken): EasingFunction {
  const cached = made.get(token);
  if (cached) return cached;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token);
  const fn = cubicBezier(...parseCurve(raw, token));
  made.set(token, fn);
  return fn;
}

export const ease = {
  /** Things settling into place. */
  out: () => curve("--ease-out"),
  /** Emphatic arrivals: letters, flaps, marks. */
  expo: () => curve("--ease-out-expo"),
  /** Departures. */
  in: () => curve("--ease-in"),
  /** Drawings and sweeps that go and come back. */
  inOut: () => curve("--ease-in-out"),
};
