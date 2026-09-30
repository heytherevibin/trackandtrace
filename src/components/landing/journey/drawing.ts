import { QUALITY_STORAGE_KEY, resolveDrawing, type MotionState, type SaverState } from "@/components/motion/motion-boot";
import { modeOf, placeAfter, readerPlace, startingReasons, wantsScene, whyOf, withReason, type DrawingMode, type DrawingReason, type Reasons } from "./drawing-mode";
import { jumpTo, keepPlace, laidOut, mastheadBottom, viewHeight, watchView } from "./keep-place";
import { glidesTo, keyboardFocus, watchTab } from "./focus-glide";
import { DRAWING_EVENT, LAYOUT_EVENT, WEBGL_EVENT, emit, type DrawingDetail, type WebglDetail } from "./journey-events";
import { createLiveLabels } from "./live-labels";
import type { JourneyContext, JourneyModule, Teardown } from "./start-journey";
import { webgl2 } from "./webgl-probe";

// Which drawing the page shows (spec §3.B–C; prototype v3's drawing.js), written to <html data-drawing> and
// data-drawing-why, and told as tt:drawing: live unless a reason holds. The head script guessed before first paint
// (motion-boot.ts); from here on this module decides. The live drawing comes in two steps (J5-2): prepared (the
// scene chunk, then the engine, a part at a time) as soon as nothing but the reader's place holds it back, then
// begun on the pinned chapter once no scroll is in flight. The pin (#anatomy.is-live) is only ever written here,
// inside keepPlace (J5-3) but for liveFits's trial, undone in the same task (J6-5), and every pin and unpin is told
// as tt:layout, so whatever measures the page below it (02's place guard) re-measures. A resize that changes the
// pinned chapter's height keeps its reader in place the same way, but for a reader inside it, who stays the same
// fraction through it: a resize keeps its shape (the owner, 2026-09-29).

export interface Ask {
  readonly still: (why: DrawingReason) => void;
  readonly live: (why: DrawingReason) => void;
}
/** Starts the prepared live drawing on the pinned chapter; its teardown stops it. */
export type Begin = () => Teardown;
/** Prepares the live drawing and resolves to what begins it. `signal` aborts when the module that asked has ended;
 * `since` is when the scene was first wanted (performance.now()), from which its time limit counts. */
export type LoadLive = (ask: Ask, ctx: JourneyContext, signal?: AbortSignal, since?: number) => Promise<Begin>;

export const noLiveDrawing: LoadLive = () => Promise.reject(new Error("no live drawing in this build"));

const PINNED = "is-live";
const PLACE_EVENTS = ["scroll", "resize", LAYOUT_EVENT] as const;
/** How long a scroll may go quiet before it counts as ended: scrollend says so where the browser has it (this only
 * backs it up), else a short pause does. */
const quietMs = (): number => ("onscrollend" in window ? 1000 : 150);

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

/**
 * Whether the live chapter's words fit its window (spec §3.C, fit), judged before the scene is fetched (J6-5): the pinned
 * layout, laid out for an instant and measured by the live labels' own layout() (a DOM measurement, no three.js), then
 * put back in the same task, so nothing paints. A reader below the chapter may have been moved by scroll anchoring
 * while it stood pinned: the scroll is put back too, through jumpTo, as every place-keeping move (a sub-pixel no-op
 * would cancel a glide in flight, and a real move is announced). The one write of the pin outside keepPlace, and still
 * this module's. The scene's own check, on every relayout while live, stands behind it. Without the chapter's markup
 * (a unit test) there is nothing to judge, and the scene decides.
 */
export function liveFits(section: HTMLElement | null): boolean {
  if (!section || section.classList.contains(PINNED)) return true;
  const y = window.scrollY;
  section.classList.add(PINNED);
  const labels = createLiveLabels(section);
  const fits = labels === null || labels.layout() !== null;
  labels?.clear();
  section.classList.remove(PINNED);
  jumpTo(y);
  return fits;
}

/** The longest the fit judgement waits for the page's web fonts (re-review, N1): a font request that never answers
 * would leave the chapter with no drawing and no reason. After it, fit is judged in whatever type the page has; a
 * misjudgement only falls back to the still. */
export const FONT_WAIT_MS = 3_000;

/** The page's web fonts are still arriving: fit judged now would measure the fallback's lines. */
function fontsLoading(): boolean {
  return "fonts" in document && document.fonts.status === "loading";
}

export function drawingModule(loadLive: LoadLive, probe: () => boolean = webgl2, fits: (section: HTMLElement | null) => boolean = liveFits): JourneyModule {
  return (ctx: JourneyContext): Teardown => {
    const { motion } = ctx;
    const html = document.documentElement;
    const section = document.getElementById("anatomy");
    // below the chapter by the same rule that moves the reader (readerPlace; the old 0 against placeAfter's −8 was J5's minor)
    const below = () => section !== null && readerPlace(section.getBoundingClientRect(), window.innerHeight) !== "above";
    let reasons: Reasons = startingReasons({ motion, saver: html.dataset.saver === "on", quality: storedQuality(), place: below() });
    // Probed only when nothing else keeps the drawing still, so a page without WebGL never fetches the scene.
    if (wantsScene(reasons) && !probe()) reasons = withReason(reasons, "webgl", true);
    let mode: DrawingMode | null = null;
    let alive = true;
    const ended = new AbortController(); // a scene that arrives after this module ends builds nothing
    let prepared: Promise<Begin> | null = null;
    let live: Teardown | null = null;
    let warned = false;
    let watching = false;
    let placeFrame = 0;
    // The page moving (an anchor's glide, a fling): begin() waits for it to end (below).
    let moving = false;
    let quiet = 0;
    let waiting = false;
    // Fit is judged in the page's own type: a first visit's chapter measured in the fallback font can read as too tall
    // and hold the still for the whole build (Task 4 review). Until the fonts load, or FONT_WAIT_MS passes, nothing is
    // judged or fetched; the scene's time limit counts from when it was first wanted, that wait included (N1).
    let typeset = !fontsLoading();
    let typeWait = 0;
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
          // Nothing about the chapter changes while the page moves: pinned, or settled on the still, its height would
          // shift under a scroll whose end is already set (an anchor's glide), landing the reader somewhere else.
          if (moving) {
            waiting = true;
            return;
          }
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
          emit(LAYOUT_EVENT); // which learn() hears: the pinned box is the one a resize is judged from
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

    const settle = () => {
      window.clearTimeout(quiet);
      quiet = 0;
      moving = false;
      if (!waiting) return;
      waiting = false;
      begin(); // where the scroll landed decides: below the chapter holds it still, above it pins
    };
    const onScroll = () => {
      moving = true;
      window.clearTimeout(quiet);
      quiet = window.setTimeout(settle, quietMs());
    };
    // an in-page link's glide starts a frame after its click, so the page counts as moving from the click
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href^="#"]')) onScroll();
    };
    // and so does a Tab's (the #94 review's root cause): a frame after its focus, under an end the browser set at the
    // focus, so the pin a frame after a Tab would land the glide where the link was. Only a real Tab's keyboard focus
    // (focus-glide.ts's rule) on something outside the window, where the browser glides; one in view scrolls nothing.
    const tab = watchTab();
    const onFocus = (event: FocusEvent) => {
      const el = event.target instanceof Element ? event.target : null;
      if (el && tab.down() && keyboardFocus(el) && glidesTo(el)) onScroll();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", settle);
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocus, true);

    // The pinned chapter's height is the window's (520vh), so a resize changes it under a reader past it, whom nothing
    // else keeps in place (02's guard keeps only its own readers). Its box, the reader's scroll and the window they saw
    // it in are kept one step behind, as 02's are (chapters.ts): by the resize the browser has already laid the page
    // out again, in the new window, and the reader is judged by the one they read in.
    // A pin whose height has changed since the place was kept is a resize not yet answered: WebKit can tell tt:layout
    // (the scene's own relayout) after laying the new window out and before "resize", and learning then would judge the
    // resize from the place it left. onResize answers it, from the place before. Keyed on the pin's own height (520vh),
    // as 02's guard and the run key on theirs, never on the window's size, which moves with no "resize" too (iOS's pinch
    // zoom, a toolbar) and would freeze the place for good (review, M2).
    // And the window the reader saw only while the page is laid out for one (laidOut): WebKit lays a resize out in
    // steps, the pin (520vh) in one and the large viewport its timeline ends at in another, in any order, with "resize"
    // between them. Answered then, the reader landed up to 14% off, and a place learned then put the next resize off
    // too. A "resize" that finds the page between them is answered by the step that completes it (watchView).
    let held: { readonly top: number; readonly bottom: number; readonly y: number; readonly vh: number; readonly view: number } | null = null;
    let owed = false;
    const learn = () => {
      if (!section?.classList.contains(PINNED)) {
        held = null;
        return;
      }
      const r = section.getBoundingClientRect();
      if (held && Math.abs(r.height - (held.bottom - held.top)) > 1) return;
      const place = { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, y: window.scrollY };
      if (laidOut()) held = { ...place, vh: window.innerHeight, view: viewHeight() };
      else if (held) held = { ...held, ...place };
    };
    const onResize = () => {
      owed = !laidOut();
      if (owed) return;
      const was = held;
      if (!was || !section?.classList.contains(PINNED)) return learn();
      const r = section.getBoundingClientRect();
      const before = { top: was.top - was.y, bottom: was.bottom - was.y, height: was.bottom - was.top };
      const after = { top: r.top + window.scrollY - was.y, height: r.height };
      // a resize keeps the pin's shape: a reader inside it stays the same fraction through it (the owner, 2026-09-29)
      const to = placeAfter(before, after, { scrollY: was.y, viewport: was.vh, viewportAfter: window.innerHeight, view: was.view, viewAfter: viewHeight(), masthead: mastheadBottom() }, "same");
      if (to !== null) jumpTo(to);
      held = null;
      learn();
    };
    window.addEventListener("scroll", learn, { passive: true });
    window.addEventListener(LAYOUT_EVENT, learn);
    window.addEventListener("resize", onResize);
    const completed = new ResizeObserver(() => {
      if (owed) onResize();
    });
    watchView(completed);

    function apply(): void {
      if (!alive) return;
      // when the scene was first wanted, for its time limit; forgotten while nothing wants it and nothing was asked
      if (!wantsScene(reasons)) wanted = prepared ? wanted : null;
      else wanted ??= performance.now();
      // judged once, just before the first fetch: a chapter that cannot fit its window never downloads the scene (J6-5)
      if (typeset && wantsScene(reasons) && !prepared && !fits(section)) reasons = withReason(reasons, "fit", true);
      if (typeset && wantsScene(reasons)) prepare();
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
    const typeReady = () => {
      if (typeset) return;
      typeset = true;
      window.clearTimeout(typeWait);
      apply();
    };
    if (!typeset) {
      typeWait = window.setTimeout(typeReady, FONT_WAIT_MS);
      void document.fonts.ready.then(typeReady);
    }
    return () => {
      alive = false;
      ended.abort();
      prepared = null;
      watchPlace(false);
      window.removeEventListener(WEBGL_EVENT, onWebgl);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", settle);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocus, true);
      tab.stop();
      window.removeEventListener("scroll", learn);
      window.removeEventListener(LAYOUT_EVENT, learn);
      window.removeEventListener("resize", onResize);
      completed.disconnect();
      window.clearTimeout(quiet);
      window.clearTimeout(typeWait);
      const pinned = section?.classList.contains(PINNED) ?? false;
      // The unpin and the still's return (data-drawing-why gone, the load window's rule lets go of it) are one change
      // to the reader below the chapter, kept in place together: the next build's report sees nothing left to keep.
      keepPlace(section, () => {
        stopLive();
        // A client navigation away leaves this markup for the next mount to find: it must read exactly what a fresh
        // boot script would choose for the motion this module was built with, never this lifetime's own reason.
        const motionState: MotionState = motion ? "on" : "off";
        const saverState: SaverState = html.dataset.saver === "on" ? "on" : "off";
        html.dataset.drawing = resolveDrawing(motionState, saverState, storedQuality());
        delete html.dataset.drawingWhy;
      });
      if (pinned) emit(LAYOUT_EVENT);
    };
  };
}

/** The scene chunk may take this long to arrive before the page gives up and draws still (spec §3.C, load; J5-11),
 * counted from when the drawing first wanted it: the wait for the page's fonts is inside it (N1). */
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
