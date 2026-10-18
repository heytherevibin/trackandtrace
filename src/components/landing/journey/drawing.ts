import { QUALITY_STORAGE_KEY, resolveDrawing, type MotionState, type SaverState } from "@/components/motion/motion-boot";
import { modeOf, startingReasons, wantsScene, whyOf, withReason, type DrawingMode, type DrawingReason, type Reasons } from "./drawing-mode";
import { DRAWING_EVENT, LAYOUT_EVENT, WEBGL_EVENT, emit, type DrawingDetail, type WebglDetail } from "./journey-events";
import type { JourneyContext, JourneyModule, Teardown } from "./start-journey";
import { webgl2 } from "./webgl-probe";

// Which drawing the terminus shows (spec §3.B–C), written to <html data-drawing> and data-drawing-why, and told as
// tt:drawing: live unless a reason holds. The head script guessed before first paint (motion-boot.ts); from here on this
// module decides. The live drawing comes in two steps (J5-2): prepared (the scene chunk, then the engine, a part at a
// time), then begun. Since 2026-10-18 the terminus is the journey's only stage: nothing is pinned, so the drawing
// begins as soon as it is ready, and nothing waits on the reader's place.

export interface Ask {
  readonly still: (why: DrawingReason) => void;
  readonly live: (why: DrawingReason) => void;
}
/** Starts the prepared live drawing; its teardown stops it. */
export type Begin = () => Teardown;
/** Prepares the live drawing and resolves to what begins it. `signal` aborts when the module that asked has ended;
 * `since` is when the scene was first wanted (performance.now()), from which its time limit counts. */
export type LoadLive = (ask: Ask, ctx: JourneyContext, signal?: AbortSignal, since?: number) => Promise<Begin>;

export const noLiveDrawing: LoadLive = () => Promise.reject(new Error("no live drawing in this build"));

/** This session's tt.q: a quality step, "still" (the floor), or nothing. The live drawing imports this one reader for
 * the governor's starting step rather than repeating it (J5 pre-flight #15). */
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

export function drawingModule(loadLive: LoadLive, probe: () => boolean = webgl2): JourneyModule {
  return (ctx: JourneyContext): Teardown => {
    const { motion } = ctx;
    const html = document.documentElement;
    let reasons: Reasons = startingReasons({ motion, saver: html.dataset.saver === "on", quality: storedQuality() });
    // Probed only when nothing else keeps the drawing still, so a page without WebGL never fetches the scene.
    if (wantsScene(reasons) && !probe()) reasons = withReason(reasons, "webgl", true);
    let mode: DrawingMode | null = null;
    let alive = true;
    const ended = new AbortController(); // a scene that arrives after this module ends builds nothing
    let prepared: Promise<Begin> | null = null;
    let live: Teardown | null = null;
    let warned = false;
    let wanted: number | null = null;

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
      const mine = loadLive(ask, ctx, ended.signal, wanted ?? undefined);
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
          try {
            live = start();
          } catch (error) {
            prepared = null;
            failed(error ?? new Error("the live drawing would not start"));
            return;
          }
          emit(LAYOUT_EVENT);
        },
        () => undefined,
      );
    };

    function apply(): void {
      if (!alive) return;
      // when the scene was first wanted, for its time limit; forgotten while nothing wants it and nothing was asked
      if (!wantsScene(reasons)) wanted = prepared ? wanted : null;
      else wanted ??= performance.now();
      if (wantsScene(reasons)) prepare();
      const want = modeOf(reasons);
      if (want !== mode) {
        mode = want;
        report(want);
        if (want === "still") stopLive();
        emit(LAYOUT_EVENT);
      } else report(want);
      if (want === "live") begin();
    }

    // The GPU dropping its context (and giving it back) is heard here, not by the live drawing, which is torn down
    // while the context is gone (v3's gotcha). Heard from before the first apply(): the engine tells a loss during its
    // own build synchronously, before the loader's promise resolves (scene/engine.ts).
    const onWebgl = (event: Event) => {
      if ((event as CustomEvent<WebglDetail>).detail === "lost") ask.still("webgl");
      else ask.live("webgl");
    };
    window.addEventListener(WEBGL_EVENT, onWebgl);

    apply();
    return () => {
      alive = false;
      ended.abort();
      prepared = null;
      window.removeEventListener(WEBGL_EVENT, onWebgl);
      stopLive();
      // A client navigation away leaves this markup for the next mount to find: it must read exactly what a fresh boot
      // script would choose for the motion this module was built with, never this lifetime's own reason.
      const motionState: MotionState = motion ? "on" : "off";
      const saverState: SaverState = html.dataset.saver === "on" ? "on" : "off";
      html.dataset.drawing = resolveDrawing(motionState, saverState, storedQuality());
      delete html.dataset.drawingWhy;
    };
  };
}

/** The scene chunk may take this long to arrive before the page gives up and draws still (spec §3.C, load; J5-11),
 * counted from when the drawing first wanted it. */
export const LOAD_LIMIT_MS = 20_000;

/** The scene chunk's one export this module calls. */
interface SceneChunk {
  readonly prepareLive: LoadLive;
}

/** The live drawing's only door: the scene chunk (three.js), imported on demand, then its engine prepared. A unit test
 * passes an import that never settles, to prove the limit (J5 pre-flight #14). */
export function sceneLoader(importScene: () => Promise<SceneChunk> = () => import("./scene/live")): LoadLive {
  return (ask, ctx, signal, since) =>
    new Promise<Begin>((resolve, reject) => {
      let settled = false; // the limit has passed: a chunk that arrives now builds nothing (J5 final review, minor 2)
      const timer = window.setTimeout(() => {
        settled = true;
        reject(new Error("the live drawing took over 20 s to arrive"));
      }, Math.max(0, LOAD_LIMIT_MS - (since === undefined ? 0 : performance.now() - since)));
      importScene().then(
        (scene) => {
          window.clearTimeout(timer);
          if (settled) return;
          settled = true;
          if (signal?.aborted) reject(new Error("the live drawing is no longer wanted"));
          else resolve(scene.prepareLive(ask, ctx));
        },
        (error: unknown) => {
          window.clearTimeout(timer);
          if (settled) return;
          settled = true;
          reject(error);
        },
      );
    });
}

export const loadScene: LoadLive = sceneLoader();

export const startDrawing = drawingModule(loadScene);
