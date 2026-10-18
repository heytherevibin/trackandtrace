import { MOTION_EVENT } from "@/components/motion/use-motion";
import { startDrawing } from "./drawing";
import { LAYOUT_EVENT, REBUILD_EVENT } from "./journey-events";
import { JOURNEY_CHUNK_MARK } from "./journey-mark";
import { refreshAll, untrackAll } from "./observers";
import { pause } from "./pause";
import type { Engine } from "./scene/engine";

// The journey chunk's entry (spec §3.B), cut down to the one piece Neubrutal v4 keeps (the owner, 2026-10-18): the
// train's live arrival at the terminus, above the closing plate. JourneyLoader imports this file after hydration, when
// the page is idle, and calls startJourney(). It marks <html data-journey="on"> and starts the drawing on the server's
// markup; its teardown puts the markup back. The Motion switch rebuilds it; leaving "/" stops it.

export { JOURNEY_CHUNK_MARK };

declare global {
  interface Window {
    /** Outside production builds only: false while the build is still starting, true once it has started and the page
     * has settled (two frames later): what the e2e specs wait on before they act. */
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

export interface JourneyContext {
  /** Motion on: things may move. Off: drawn still. */
  readonly motion: boolean;
  /** The live drawing's engine, kept for this startJourney's whole lifetime and reused by every rebuild (J5-4). */
  readonly scene: Kept<Promise<Engine> | null>;
  /** Runs `stop` once when this startJourney ends, never on a rebuild; at once if it has already ended. */
  readonly atEnd: (stop: Teardown) => void;
}
export type Teardown = () => void;
export type JourneyModule = (ctx: JourneyContext) => Teardown;

/** The journey's modules, in start order: the terminus drawing alone. */
export const MODULES: readonly JourneyModule[] = [startDrawing];

export function startJourney(): Teardown {
  const html = document.documentElement;
  let teardowns: Teardown[] = [];
  let stops = 0;
  let ended = false;
  let resizeTimer = 0;
  let settleFrame = 0;
  const life = lifetime();
  const scene = keep<Promise<Engine> | null>(null);

  const stopAll = () => {
    stops += 1;
    for (const t of teardowns.reverse()) t();
    teardowns = [];
    untrackAll();
  };
  /** Starts every module in order, with `pace` between them on the first build; a module that throws stops everything
   * the build started and marks the journey failed. */
  const build = async (pace?: () => Promise<void>): Promise<void> => {
    stopAll();
    const run = stops;
    const ctx: JourneyContext = { motion: html.getAttribute("data-motion") !== "off", scene, atEnd: life.atEnd };
    try {
      for (const [i, start] of MODULES.entries()) {
        if (pace && i > 0) {
          await pace();
          if (run !== stops) return;
        }
        teardowns.push(start(ctx));
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
    build().catch((error: unknown) => {
      console.error(error);
      end();
    });
  };
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => window.dispatchEvent(new Event(LAYOUT_EVENT)), 150);
  };

  const end = () => {
    if (ended) return;
    ended = true;
    window.removeEventListener(MOTION_EVENT, rebuild);
    window.removeEventListener(REBUILD_EVENT, rebuild);
    window.removeEventListener("resize", onResize);
    window.removeEventListener(LAYOUT_EVENT, refreshAll);
    window.clearTimeout(resizeTimer);
    cancelAnimationFrame(settleFrame);
    stopAll();
    life.end();
    scene.set(null);
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
      settleFrame = requestAnimationFrame(() => {
        settleFrame = requestAnimationFrame(() => {
          settleFrame = 0;
          if (probed) window.__ttJourneyStarted = true;
        });
      });
    },
    (error: unknown) => {
      console.error(error);
      end();
    },
  );
  return end;
}
