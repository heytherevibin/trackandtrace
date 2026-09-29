import { flushSync } from "react-dom";
import { THEME_EVENT, emit } from "@/components/landing/journey/journey-events";
import type { ThemeChoice } from "./use-theme";

// Night falls (spec 2026-09-24 §3.F; prototype v3's shell.js; J6-10). The theme button's change sweeps out from the
// button in a widening circle, the drawn train redrawn inside it at once. A same-document View Transition captures the
// page in both themes; the new one is revealed by a clip-path circle on ::view-transition-new(root). Instant where the
// browser has no View Transitions, and wherever Motion is not on: html[data-motion] also answers reduced motion, and
// only the traveller pages' head script writes it, so the console always switches at once.

export const SWEEP_MS = 640;
const APPLIED_CAP_MS = 100;
const EASE_IN_OUT = "--ease-in-out";

interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The circle's centre (the button's) and the radius that reaches the window's farthest corner. */
export function sweepFrom(box: Box, viewport: { readonly width: number; readonly height: number }): { readonly x: number; readonly y: number; readonly reach: number } {
  const x = Math.round(box.left + box.width / 2);
  const y = Math.round(box.top + box.height / 2);
  return { x, y, reach: Math.ceil(Math.hypot(Math.max(x, viewport.width - x), Math.max(y, viewport.height - y))) };
}

/** Resolves once <html data-theme> reads `resolved` (next-themes writes it in an effect), or after 100 ms at most. */
export function themeApplied(resolved: "light" | "dark", cap = APPLIED_CAP_MS): Promise<void> {
  const html = document.documentElement;
  if (html.dataset.theme === resolved) return Promise.resolve();
  return new Promise((done) => {
    const finish = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      done();
    };
    const observer = new MutationObserver(() => {
      if (html.dataset.theme === resolved) finish();
    });
    observer.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    const timer = window.setTimeout(finish, cap);
  });
}

/** The theme a choice resolves to now. */
export function resolvedChoice(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Changes the theme: `apply` sets it (inside flushSync, so React commits it at once), then the drawn train redraws. */
export function nightFalls(from: Element, apply: () => void, resolved: "light" | "dark"): void {
  const html = document.documentElement;
  const redraw = () => emit(THEME_EVENT);
  if (typeof document.startViewTransition !== "function" || html.dataset.motion !== "on") {
    apply();
    void themeApplied(resolved).then(redraw);
    return;
  }
  const { x, y, reach } = sweepFrom(from.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
  const easing = getComputedStyle(html).getPropertyValue(EASE_IN_OUT).trim() || "ease-in-out";
  // Each sweep's own mark: a second click starts a new transition, which cancels this one, and this one's `finished`
  // settles after the new mark is written. Only the sweep whose mark still stands clears it, so the second keeps its
  // rules (no cross-fade, the masthead swept with the page).
  const mark = String(Number(html.dataset.themeSweep ?? 0) + 1);
  html.dataset.themeSweep = mark;
  const transition = document.startViewTransition(async () => {
    flushSync(apply);
    await themeApplied(resolved);
    redraw();
  });
  transition.ready.then(
    () => html.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] }, { duration: SWEEP_MS, easing, pseudoElement: "::view-transition-new(root)" }),
    () => undefined,
  );
  const done = () => {
    if (html.dataset.themeSweep === mark) delete html.dataset.themeSweep;
  };
  transition.finished.then(done, done);
}
