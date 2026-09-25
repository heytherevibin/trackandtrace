import { MOTION_EVENT } from "@/components/motion/use-motion";
import { startArrivals } from "./arrivals";
import { startBoard } from "./board";
import { startChapters, startPlaceGuard } from "./chapters";
import { startHero } from "./hero";
import { introWanted, startIntro } from "./intro";
import { LAYOUT_EVENT, REBUILD_EVENT } from "./journey-events";
import { JOURNEY_CHUNK_MARK } from "./journey-mark";
import { refreshAll, untrackAll } from "./observers";
import { startStrip } from "./strip";

// The journey chunk's entry (spec §3.B). JourneyLoader imports this file after hydration, when the page is
// idle, and calls startJourney(). It marks <html data-journey="on"> and starts every module on the server's
// markup; each returns a teardown that puts the markup back. The Motion switch and a fit change rebuild them
// all, idempotently; leaving "/" stops them.

export { JOURNEY_CHUNK_MARK };

export interface JourneyContext {
  /** Motion on: things may move. Off: only true readings update, drawn still. */
  readonly motion: boolean;
  /** True only in the build that plays the once-per-visit intro. */
  readonly intro: boolean;
}
export type Teardown = () => void;
export type JourneyModule = (ctx: JourneyContext) => Teardown;

/** In start order. Later tasks append their modules here. */
export const MODULES: readonly JourneyModule[] = [startArrivals, startBoard, startStrip, startHero, startChapters];

export function startJourney(): Teardown {
  const html = document.documentElement;
  let teardowns: Teardown[] = [];
  let resizeTimer = 0;
  let introPlayed = false;

  const stopAll = () => {
    for (const t of teardowns.reverse()) t();
    teardowns = [];
    untrackAll();
  };
  const build = () => {
    stopAll();
    const motion = html.getAttribute("data-motion") !== "off";
    const intro = !introPlayed && introWanted(motion);
    introPlayed = true;
    const ctx: JourneyContext = { motion, intro };
    try {
      if (intro) teardowns.push(startIntro());
      for (const start of MODULES) teardowns.push(start(ctx));
    } catch (error) {
      stopAll();
      html.setAttribute("data-journey", "failed");
      throw error;
    }
    requestAnimationFrame(() => window.dispatchEvent(new Event(LAYOUT_EVENT)));
  };
  const rebuild = () => {
    if (html.getAttribute("data-journey") !== "on") return;
    try {
      build();
    } catch (error) {
      console.error(error);
    }
  };
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => window.dispatchEvent(new Event(LAYOUT_EVENT)), 150);
  };

  // Started here, once, rather than by startChapters on every build: a Motion toggle rewrites <html
  // data-motion> and collapses #how's pinned height by the CSS selector alone, before any module's own
  // teardown or the next build's modules get a turn — this guard must already be watching when that
  // happens, and must survive the rebuild it is reacting to, not be one of the things stopAll() tears down.
  const stopPlaceGuard = startPlaceGuard();

  html.setAttribute("data-journey", "on");
  build();
  window.addEventListener(MOTION_EVENT, rebuild);
  window.addEventListener(REBUILD_EVENT, rebuild);
  window.addEventListener("resize", onResize);
  window.addEventListener(LAYOUT_EVENT, refreshAll);
  return () => {
    window.removeEventListener(MOTION_EVENT, rebuild);
    window.removeEventListener(REBUILD_EVENT, rebuild);
    window.removeEventListener("resize", onResize);
    window.removeEventListener(LAYOUT_EVENT, refreshAll);
    window.clearTimeout(resizeTimer);
    stopAll();
    stopPlaceGuard();
    if (html.getAttribute("data-journey") === "on") html.removeAttribute("data-journey");
  };
}
