import { MOTION_EVENT } from "@/components/motion/use-motion";
import { startArrivals } from "./arrivals";
import { startBerths } from "./berths";
import { startBoard } from "./board";
import { startChapters, startPlaceGuard } from "./chapters";
import { startClock } from "./clock";
import { startCursor } from "./cursor";
import { startDrawing } from "./drawing";
import { startFocusGlide } from "./focus-glide";
import { startHero } from "./hero";
import { introWanted, startIntro } from "./intro";
import { LAYOUT_EVENT, REBUILD_EVENT, type ResultDetail } from "./journey-events";
import { JOURNEY_CHUNK_MARK } from "./journey-mark";
import { refreshAll, untrackAll } from "./observers";
import { pause } from "./pause";
import { startPlaceMemory } from "./place-memory";
import { startRoute } from "./route";
import { startRun } from "./run";
import type { Engine } from "./scene/engine";
import { startSound } from "./sound";
import { startStationProgress } from "./station-progress";
import { startStill } from "./still";

// The journey chunk's entry (spec §3.B). JourneyLoader imports this file after hydration, when the page is
// idle, and calls startJourney(). It marks <html data-journey="on"> and starts every module on the server's
// markup, a module at a time, letting the page have a turn between them (spec §3.H: no journey task at load over
// 120 ms at 4× CPU); each returns a teardown that puts the markup back. The Motion switch and a fit change rebuild
// them all at once, idempotently; leaving "/" stops them.

export { JOURNEY_CHUNK_MARK };

declare global {
  interface Window {
    /** Outside production builds only: false while the first build is still starting its modules a turn at a time,
     * true once every module has started and the page has settled (its first layout pass and the place restore, two
     * frames later): what the e2e specs wait on before they act. */
    __ttJourneyStarted?: boolean;
  }
}
const probed = process.env.NODE_ENV !== "production";

/** A value startJourney holds for its whole lifetime, across every rebuild. */
export interface Kept<T> {
  get(): T;
  set(value: T): void;
}

export function keep<T>(initial: T): Kept<T> {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
}

export interface Lifetime {
  atEnd(stop: Teardown): void;
  end(): void;
}

/** What must outlive every rebuild but not the journey: the live drawing's engine above all (J5-4). */
export function lifetime(): Lifetime {
  const stops: Teardown[] = [];
  let ended = false;
  return {
    atEnd: (stop) => {
      if (ended) stop();
      else stops.push(stop);
    },
    end: () => {
      if (ended) return;
      ended = true;
      for (const stop of [...stops].reverse()) stop();
      stops.length = 0;
    },
  };
}

/** The pin's columns state and the height the reader last actually saw it settle on (still.ts). */
export interface StillPlace {
  readonly columns: boolean;
  readonly height: number | null;
}

export interface JourneyContext {
  /** Motion on: things may move. Off: only true readings update, drawn still. */
  readonly motion: boolean;
  /** True only in the build that plays the once-per-visit intro. */
  readonly intro: boolean;
  /** The hero plate's last result while it still shows it: its chart face is a true reading, so each build redraws it. */
  readonly result: Kept<ResultDetail | null>;
  /** still.ts's own place, kept for this startJourney's whole lifetime, across every rebuild — never reset by a
   * teardown within that lifetime. A new startJourney (a fresh client navigation back to the page) starts fresh. */
  readonly still: Kept<StillPlace>;
  /** The live drawing's engine, kept for this startJourney's whole lifetime and reused by every rebuild (J5-4). */
  readonly scene: Kept<Promise<Engine> | null>;
  /** Runs `stop` once when this startJourney ends, never on a rebuild; at once if it has already ended. */
  readonly atEnd: (stop: Teardown) => void;
}
export type Teardown = () => void;
export type JourneyModule = (ctx: JourneyContext) => Teardown;

export interface JourneyOptions {
  /** The frame meter is allowed here (preview deployments and development, J5-10). */
  readonly hud?: boolean;
}

/** In start order; a rebuild tears them down in reverse. The run (06–07) is last, so it is torn down first: its unpin
 * is measured on the page the reader sees, before the still's and the drawing's teardowns change the layout above it
 * for a moment (J6-7). Later tasks append their modules before it. */
export const MODULES: readonly JourneyModule[] = [startArrivals, startBoard, startStationProgress, startHero, startChapters, startBerths, startClock, startRoute, startCursor, startSound, startDrawing, startStill, startFocusGlide, startRun];

export function startJourney(options: JourneyOptions = {}): Teardown {
  const html = document.documentElement;
  let teardowns: Teardown[] = [];
  let stops = 0; // counts stopAll(): a paced build that sees it change was stopped or replaced, and starts no more
  let ended = false;
  let resizeTimer = 0;
  let introPlayed = false;
  const result = keep<ResultDetail | null>(null);
  const still = keep<StillPlace>({ columns: false, height: null });
  const life = lifetime();
  const scene = keep<Promise<Engine> | null>(null);

  const stopAll = () => {
    stops += 1;
    for (const t of teardowns.reverse()) t();
    teardowns = [];
    untrackAll();
  };
  /** Starts every module in order. With `pace` (the first build, at load) it waits for the page between modules,
   * and a stop or a rebuild meanwhile ends it; without, it starts them all before it returns. A module that throws
   * stops everything the build started and marks the journey failed. */
  const build = async (pace?: () => Promise<void>): Promise<void> => {
    stopAll();
    const run = stops;
    const motion = html.getAttribute("data-motion") !== "off";
    const intro = !introPlayed && introWanted(motion);
    introPlayed = true;
    const ctx: JourneyContext = { motion, intro, result, still, scene, atEnd: life.atEnd };
    const starts: ReadonlyArray<() => Teardown> = [...(intro ? [startIntro] : []), ...MODULES.map((start) => () => start(ctx))];
    try {
      for (const [i, start] of starts.entries()) {
        if (pace && i > 0) {
          await pace();
          if (run !== stops) return;
        }
        teardowns.push(start());
      }
    } catch (error) {
      stopAll();
      html.setAttribute("data-journey", "failed");
      throw error;
    }
    requestAnimationFrame(() => window.dispatchEvent(new Event(LAYOUT_EVENT)));
  };
  const rebuild = () => {
    if (html.getAttribute("data-journey") !== "on") return;
    // A rebuild that fails ends the journey exactly as a failed first build does (below): nothing stays running,
    // the kept engine included, on a page marked "failed".
    build().catch((error: unknown) => {
      console.error(error);
      end();
    });
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
  // Back to "/": the reader's section, restored once this first build and its layout have settled (the pin, and
  // the drawing's columns, a frame after build's own LAYOUT_EVENT), never the raw scrollY a pinned 02 left behind.
  const memory = startPlaceMemory();
  let settleFrame = 0;

  const end = () => {
    if (ended) return;
    ended = true;
    window.removeEventListener(MOTION_EVENT, rebuild);
    window.removeEventListener(REBUILD_EVENT, rebuild);
    window.removeEventListener("resize", onResize);
    window.removeEventListener(LAYOUT_EVENT, refreshAll);
    window.clearTimeout(resizeTimer);
    cancelAnimationFrame(settleFrame);
    memory.stop();
    stopAll();
    life.end();
    scene.set(null);
    stopPlaceGuard();
    if (html.getAttribute("data-journey") === "on") html.removeAttribute("data-journey");
    if (probed) delete window.__ttJourneyStarted;
  };

  html.setAttribute("data-journey", "on");
  if (probed) window.__ttJourneyStarted = false;
  window.addEventListener(MOTION_EVENT, rebuild);
  window.addEventListener(REBUILD_EVENT, rebuild);
  window.addEventListener("resize", onResize);
  window.addEventListener(LAYOUT_EVENT, refreshAll);
  build(pause).then(
    () => {
      if (ended) return;
      // The frame meter (J5-10): its own chunk, fetched only when allowed and asked for; it ends with the journey.
      if (options.hud && new URLSearchParams(window.location.search).has("journey-hud")) {
        void import("./hud").then(({ startHud }) => life.atEnd(startHud()), () => undefined);
      }
      settleFrame = requestAnimationFrame(() => {
        settleFrame = requestAnimationFrame(() => {
          settleFrame = 0;
          memory.restore();
          if (probed) window.__ttJourneyStarted = true;
        });
      });
    },
    (error: unknown) => {
      // The first build failed (data-journey="failed"): everything started here stops here, the guard above all,
      // which would otherwise keep moving a reader inside #how on a page marked "failed".
      console.error(error);
      end();
    },
  );
  return end;
}

