import { QUALITY_STORAGE_KEY, resolveDrawing, type MotionState, type SaverState } from "@/components/motion/motion-boot";
import { modeOf, placeAfter, startingReasons, wantsScene, whyOf, withReason, type DrawingMode, type DrawingReason, type Reasons } from "./drawing-mode";
import { DRAWING_EVENT, LAYOUT_EVENT, WEBGL_EVENT, emit, type DrawingDetail, type WebglDetail } from "./journey-events";
import type { JourneyContext, JourneyModule, Teardown } from "./start-journey";
import { webgl2 } from "./webgl-probe";

// Which drawing the page shows (spec §3.B–C; prototype v3's drawing.js), written to <html data-drawing> and
// data-drawing-why, and told as tt:drawing: live unless a reason holds. The head script guessed before first paint
// (motion-boot.ts); from here on this module decides. The live drawing comes in two steps (J5-2): prepared (the
// scene chunk, then the engine, a part at a time) as soon as nothing but the reader's place holds it back, then
// begun on the pinned chapter. The pin (#anatomy.is-live) is only ever written here, inside keepPlace (J5-3), and
// every pin and unpin is told as tt:layout, so whatever measures the page below it (02's place guard) re-measures.

export interface Ask {
  readonly still: (why: DrawingReason) => void;
  readonly live: (why: DrawingReason) => void;
}
/** Starts the prepared live drawing on the pinned chapter; its teardown stops it. */
export type Begin = () => Teardown;
/** Prepares the live drawing and resolves to what begins it. */
export type LoadLive = (ask: Ask, ctx: JourneyContext) => Promise<Begin>;

export const noLiveDrawing: LoadLive = () => Promise.reject(new Error("no live drawing in this build"));

const PINNED = "is-live";
const PLACE_EVENTS = ["scroll", "resize", LAYOUT_EVENT] as const;

/** This session's tt.q: a quality step, "still" (the floor), or nothing. The live chapter imports this one reader
 * for the governor's starting step rather than repeating it (J5 pre-flight #15). */
export function storedQuality(): string | null {
  try {
    return window.sessionStorage.getItem(QUALITY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The quality floor lasts the session: the head script reads it on the next load (J4-12). */
function storeFloor(): void {
  try {
    window.sessionStorage.setItem(QUALITY_STORAGE_KEY, "still");
  } catch {
    // no session storage: the floor lasts this page only
  }
}

function mastheadBottom(): number {
  return Math.round(document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
}

/** Runs a change to the chapter, then puts the reader where placeAfter says (J5-3). A chapter already gone from the
 * document (a client navigation away) just changes. */
function keepPlace(section: HTMLElement | null, change: () => void): void {
  if (!section?.isConnected) {
    change();
    return;
  }
  const before = section.getBoundingClientRect();
  const scrollY = window.scrollY;
  change();
  const to = placeAfter(before, section.getBoundingClientRect(), { scrollY, viewport: window.innerHeight, masthead: mastheadBottom() });
  if (to !== null) window.scrollTo({ top: to, behavior: "instant" });
}

export function drawingModule(loadLive: LoadLive, probe: () => boolean = webgl2): JourneyModule {
  return (ctx: JourneyContext): Teardown => {
    const { motion } = ctx;
    const html = document.documentElement;
    const section = document.getElementById("anatomy");
    const below = () => (section?.getBoundingClientRect().top ?? 0) < 0;
    let reasons: Reasons = startingReasons({ motion, saver: html.dataset.saver === "on", quality: storedQuality(), place: below() });
    // Probed only when nothing else keeps the drawing still, so a page without WebGL never fetches the scene.
    if (wantsScene(reasons) && !probe()) reasons = withReason(reasons, "webgl", true);
    let mode: DrawingMode | null = null;
    let alive = true;
    let prepared: Promise<Begin> | null = null;
    let live: Teardown | null = null;
    let warned = false;
    let watching = false;
    let placeFrame = 0;

    const report = (now: DrawingMode) => {
      html.dataset.drawing = now;
      html.dataset.drawingWhy = whyOf(reasons);
      emit<DrawingDetail>(DRAWING_EVENT, { mode: now, reasons: [...reasons] });
    };

    const ask: Ask = {
      still: (why) => {
        if (why === "quality") storeFloor();
        reasons = withReason(reasons, why, true);
        apply();
      },
      live: (why) => {
        reasons = withReason(reasons, why, false);
        apply();
      },
    };

    const failed = (error: unknown) => {
      if (!warned) {
        warned = true;
        console.warn("The live drawing did not start; the page draws it still.", error);
      }
      ask.still("load");
    };

    const prepare = () => {
      if (prepared) return;
      const mine = loadLive(ask, ctx);
      prepared = mine;
      mine.catch((error: unknown) => {
        if (prepared !== mine) return;
        prepared = null;
        if (alive) failed(error);
      });
    };

    const stopLive = () => {
      const stop = live;
      live = null;
      stop?.();
      section?.classList.remove(PINNED);
    };

    /** Pins the chapter and starts the live drawing on it; the error it threw, if it did. */
    const pin = (start: Begin): unknown => {
      let thrown: unknown;
      keepPlace(section, () => {
        section?.classList.add(PINNED);
        try {
          live = start();
        } catch (error) {
          thrown = error ?? new Error("the live drawing would not start");
          section?.classList.remove(PINNED);
        }
      });
      return thrown;
    };

    const begin = () => {
      const mine = prepared;
      if (!mine) return;
      const kept = ctx.scene.get();
      Promise.all([mine, kept?.catch(() => null) ?? null]).then(
        ([start, engine]) => {
          if (!alive || prepared !== mine || mode !== "live" || live) return;
          // The engine is the journey's, this module only the build's: a GPU lost before a rebuild was heard by the
          // module it tore down, never by this one, so the engine is asked. "restored" brings the drawing back.
          if (engine?.lost()) {
            ask.still("webgl");
            return;
          }
          // The reader went below the chapter while the scene loaded: pinning now would grow it under them.
          if (below()) {
            ask.still("place");
            return;
          }
          const thrown = pin(start);
          if (thrown !== undefined) {
            prepared = null;
            failed(thrown);
            return;
          }
          emit(LAYOUT_EVENT);
        },
        () => undefined,
      );
    };

    const recheck = () => {
      if (placeFrame) return;
      placeFrame = requestAnimationFrame(() => {
        placeFrame = 0;
        if (reasons.has("place") && !below()) ask.live("place");
      });
    };
    const watchPlace = (on: boolean) => {
      if (on === watching) return;
      watching = on;
      for (const type of PLACE_EVENTS) {
        if (on) window.addEventListener(type, recheck, { passive: true });
        else window.removeEventListener(type, recheck);
      }
      if (!on && placeFrame) {
        cancelAnimationFrame(placeFrame);
        placeFrame = 0;
      }
    };

    function apply(): void {
      if (!alive) return;
      if (wantsScene(reasons)) prepare();
      const want = modeOf(reasons);
      if (want !== mode) {
        keepPlace(section, () => {
          mode = want;
          report(want);
          if (want === "still") stopLive();
        });
        emit(LAYOUT_EVENT);
      } else report(want);
      if (want === "live") begin();
      watchPlace(reasons.has("place"));
    }

    // The GPU dropping its context (and giving it back) is heard here, not by the live drawing, which is torn down
    // while the context is gone (v3's gotcha). Heard from before the first apply(): the engine tells a loss during
    // its own build synchronously, before the loader's promise resolves (scene/engine.ts).
    const onWebgl = (event: Event) => {
      if ((event as CustomEvent<WebglDetail>).detail === "lost") ask.still("webgl");
      else ask.live("webgl");
    };
    window.addEventListener(WEBGL_EVENT, onWebgl);

    apply();
    return () => {
      alive = false;
      prepared = null;
      watchPlace(false);
      window.removeEventListener(WEBGL_EVENT, onWebgl);
      const pinned = section?.classList.contains(PINNED) ?? false;
      keepPlace(section, stopLive);
      if (pinned) emit(LAYOUT_EVENT);
      // A client navigation away leaves this markup for the next mount to find: it must read exactly what a fresh
      // boot script would choose for the motion this module was built with, never this lifetime's own reason.
      const motionState: MotionState = motion ? "on" : "off";
      const saverState: SaverState = html.dataset.saver === "on" ? "on" : "off";
      html.dataset.drawing = resolveDrawing(motionState, saverState, storedQuality());
      delete html.dataset.drawingWhy;
    };
  };
}

export const startDrawing = drawingModule(noLiveDrawing);
