import { animate, onScroll, type ScrollObserver } from "animejs";
import { QUALITY_STORAGE_KEY } from "@/components/motion/motion-boot";
import { messages } from "@/messages";
import { storedQuality, type Ask, type Begin } from "../drawing";
import { createGovernor, nextFrame, startLevel } from "../governor";
import { LAYOUT_EVENT, THEME_EVENT } from "../journey-events";
import { SMOOTH } from "../motion-tokens";
import { track } from "../observers";
import { terminusPose } from "../pose";
import type { JourneyContext, Teardown } from "../start-journey";
import { QUALITY, createEngine, type Engine } from "./engine";
import { readPalette, systemReader, tokenReader, type ScenePalette } from "./palette";
import { SCENE_CHUNK_MARK } from "./scene-mark";

// The live drawn train (spec §3.A; prototype v3's journey.js), cut down on 2026-10-18 to the one stage Neubrutal v4
// keeps: the train arriving at the terminus, above the closing plate, drawn in the page's ink with a yellow headlight.
// Anime.js turns scroll into progress; one render loop draws while the stage shows, and a governor steps quality down
// when frames run long. The engine is kept for the journey's life (J5-4).

export { SCENE_CHUNK_MARK };

interface JourneyProbe {
  terminus(): number;
  quality(): number;
  night(): boolean;
  inked(selector: string): number;
}
declare global {
  interface Window {
    /** Outside production builds only (J5-13): what the e2e specs read. */
    __ttJourney?: JourneyProbe;
    /** Outside production builds only: set by the e2e fixture, whose software GPU draws slower than any budget (J5-12),
     * so the governor may step quality down but never floors the drawing to the still. */
    __ttHoldFloor?: boolean;
  }
}

const night = (): boolean => document.documentElement.dataset.theme === "dark";
const FORCED = "(forced-colors: active)";

/** The theme's tokens, or the system's own colours under forced colours (J5-21); null when they do not parse. */
function readColours(): ScenePalette | null {
  return readPalette(window.matchMedia(FORCED).matches ? systemReader() : tokenReader(), night());
}

function palette(): ScenePalette {
  const p = readColours();
  if (!p) throw new Error("the theme's colour tokens did not parse");
  return p;
}

/** Waits for the page: scheduler.yield where the browser has it, else a task. The scene keeps its own rather than the
 * journey's (../pause.ts): a trace (Long Animation Frames) names the work after a yield for the script that called
 * scheduler.yield, so the scene's steps read as the scene's, and scripts/journey-perf.mjs can hold them to 61 ms. */
function pause(): Promise<void> {
  const scheduler: unknown = Reflect.get(window, "scheduler");
  const yielding: unknown = typeof scheduler === "object" && scheduler !== null ? Reflect.get(scheduler, "yield") : undefined;
  if (typeof yielding === "function") {
    const waited: unknown = Reflect.apply(yielding, scheduler, []);
    return Promise.resolve(waited).then(() => undefined);
  }
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

/** The engine for this journey: built once, a part at a time, and disposed when the journey ends (J5-4). */
function engineFor(ctx: JourneyContext): Promise<Engine> {
  const held = ctx.scene.get();
  if (held) return held;
  const colours = palette();
  const canvas = document.createElement("canvas");
  canvas.id = "journey-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.hidden = true;
  (document.getElementById("app-root") ?? document.body).append(canvas);
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "sans-serif";
  const coaches = window.matchMedia("(max-width: 47.99rem)").matches ? 2 : 3;
  const made = createEngine(canvas, { palette: colours, coaches, words: messages.home.drawing.nameboard, family }, pause);
  ctx.scene.set(made);
  ctx.atEnd(() => {
    void made.then(
      (engine) => {
        engine.dispose();
        canvas.remove();
      },
      () => canvas.remove(),
    );
  });
  made.catch(() => {
    if (ctx.scene.get() === made) ctx.scene.set(null);
    canvas.remove();
  });
  return made;
}

/** Loads nothing more: builds (or reuses) the engine and hands back what begins the live chapter on it. */
export async function prepareLive(ask: Ask, ctx: JourneyContext): Promise<Begin> {
  const engine = await engineFor(ctx);
  return () => startLive(engine, ask);
}

function startLive(engine: Engine, ask: Ask): Teardown {
  const stageT = document.querySelector<HTMLElement>(".terminus-stage");
  if (!stageT) throw new Error("the terminus's markup is missing");
  const T = { p: 0 };
  let drawnKey = "";
  engine.setPalette(palette()); // the theme may have changed while nothing live listened
  engine.canvas.hidden = false; // this module owns the canvas element: it shows only while the drawing is live

  engine.addView("terminus", { el: stageT, bleed: true, update: ({ aspect, quality, night: isNight }) => engine.live(terminusPose(T.p, aspect), quality, isNight) });

  // ---- scroll → progress: the train rolls in as the stage comes up the window and stands once it is half way
  const observeT = track(onScroll({ target: stageT, enter: "bottom top", leave: "center center", sync: SMOOTH }));
  const driveT = animate(T, { p: [0, 1], ease: "linear", duration: 1000, autoplay: observeT });

  // ---- quality: frame intervals while drawing steer the resolution, the coaches and the headlight
  const governor = createGovernor({
    levels: QUALITY.length,
    start: startLevel(storedQuality(), QUALITY.length),
    set: (level) => {
      engine.setQuality(level);
      try {
        window.sessionStorage.setItem(QUALITY_STORAGE_KEY, String(level));
      } catch {
        // the step lasts this page only
      }
      drawnKey = "";
    },
    floor: () => {
      if (process.env.NODE_ENV !== "production" && window.__ttHoldFloor === true) return;
      ask.still("quality");
    },
  });
  engine.setQuality(governor.level());

  // ---- draw only while the stage is on (or about to come on) screen, and only when something changed. anime's scroll
  // sync stays awake for 500 ms of its clock after each scroll event, so one long frame (a slow phone's stall) can spend
  // that in a single tick and leave the drawing short of the page: a frame with nothing to draw while the progress still
  // disagrees with its scroll wakes the sync, so it catches up.
  const behind = (observer: ScrollObserver, p: number): boolean => Math.abs(observer.progress - p) > 1e-4;
  let onScreen = false;
  let raf = 0;
  const loop = (now: number) => {
    const key = `${T.p}|${stageT.getBoundingClientRect().top}|${window.innerWidth}`;
    if (key !== drawnKey) {
      drawnKey = key;
      engine.frame();
      governor.drew(now);
    } else {
      governor.idle();
      if (behind(observeT, T.p)) observeT.container.handleScroll();
    }
    raf = nextFrame(onScreen, governor, () => requestAnimationFrame(loop));
  };
  // a long gap the page scrolled through is a slow frame of the gesture, not a new one (governor.ts)
  const onPageScroll = () => governor.scrolled();
  window.addEventListener("scroll", onPageScroll, { passive: true });
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) onScreen = e.isIntersecting;
      if (onScreen && !raf) raf = requestAnimationFrame(loop);
      if (!onScreen) engine.frame();
    },
    { rootMargin: "20% 0px" },
  );
  io.observe(stageT);

  // ---- theme: re-read the tokens and draw at once (J5-9); tt:theme is Night falls' synchronous redraw (J6)
  const onTheme = () => {
    const next = readColours();
    if (next) engine.setPalette(next);
    drawnKey = "";
    engine.frame();
  };
  const themeWatch = new MutationObserver(onTheme);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const forced = window.matchMedia(FORCED);
  forced.addEventListener("change", onTheme);
  window.addEventListener(THEME_EVENT, onTheme);
  const redraw = () => {
    drawnKey = "";
    engine.frame();
  };
  window.addEventListener(LAYOUT_EVENT, redraw);
  engine.frame();

  if (process.env.NODE_ENV !== "production") {
    window.__ttJourney = {
      terminus: () => T.p,
      quality: () => engine.quality(),
      night: () => engine.night(),
      inked: (selector) => {
        const el = document.querySelector(selector);
        return el ? engine.inked(el) : 0;
      },
    };
  }

  return () => {
    driveT.revert();
    observeT.revert();
    io.disconnect();
    cancelAnimationFrame(raf);
    window.removeEventListener("scroll", onPageScroll);
    themeWatch.disconnect();
    forced.removeEventListener("change", onTheme);
    window.removeEventListener(THEME_EVENT, onTheme);
    window.removeEventListener(LAYOUT_EVENT, redraw);
    engine.removeView("terminus");
    engine.frame(); // nothing left on screen: clears the canvas
    engine.canvas.hidden = true;
    if (process.env.NODE_ENV !== "production") delete window.__ttJourney;
  };
}
