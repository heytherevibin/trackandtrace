import { QUALITY_STORAGE_KEY, resolveDrawing, type MotionState, type SaverState } from "@/components/motion/motion-boot";
import { keepsPlace, modeOf, startingReasons, whyOf, withReason, type DrawingMode, type DrawingReason, type Reasons } from "./drawing-mode";
import { DRAWING_EVENT, LAYOUT_EVENT, emit, type DrawingDetail } from "./journey-events";
import type { JourneyContext, JourneyModule, Teardown } from "./start-journey";

// Which drawing the page shows (spec §3.B–C; prototype v3's drawing.js), written to <html data-drawing> and
// data-drawing-why, and told as tt:drawing: live unless a reason holds. The head script guessed before first paint
// (motion-boot.ts); from here on this module decides. J4 has no live drawing, so its loader says so and every page
// settles still (J4-6); J5 hands drawingModule the scene chunk's loader, the WebGL probe and the fit reason.

export interface Ask {
  readonly still: (why: DrawingReason) => void;
  readonly live: (why: DrawingReason) => void;
}
export type LoadLive = (ask: Ask) => Promise<Teardown>;

export const noLiveDrawing: LoadLive = () => Promise.reject(new Error("the live drawing arrives in J5"));

function storedQuality(): string | null {
  try {
    return window.sessionStorage.getItem(QUALITY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function mastheadBottom(): number {
  return Math.round(document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
}

/** A switch of drawing that changes the chapter's height under a reader inside it puts them back at its start. */
function keepPlace(change: () => void): void {
  const section = document.getElementById("anatomy");
  const before = section?.getBoundingClientRect();
  change();
  if (!section || !before) return;
  const after = section.getBoundingClientRect();
  if (keepsPlace(before, after.height, window.innerHeight)) window.scrollTo({ top: Math.round(after.top + window.scrollY - mastheadBottom()), behavior: "instant" });
}

export function drawingModule(loadLive: LoadLive): JourneyModule {
  return ({ motion }: JourneyContext): Teardown => {
    const html = document.documentElement;
    let reasons: Reasons = startingReasons({ motion, saver: html.dataset.saver === "on", quality: storedQuality() });
    let mode: DrawingMode | null = null;
    let alive = true;
    let token: object | null = null;
    let live: Teardown | null = null;

    const report = (now: DrawingMode) => {
      html.dataset.drawing = now;
      html.dataset.drawingWhy = whyOf(reasons);
      emit<DrawingDetail>(DRAWING_EVENT, { mode: now, reasons: [...reasons] });
    };

    const ask: Ask = {
      still: (why) => {
        reasons = withReason(reasons, why, true);
        apply();
      },
      live: (why) => {
        reasons = withReason(reasons, why, false);
        apply();
      },
    };

    const startLive = () => {
      const mine = {};
      token = mine;
      loadLive(ask).then(
        (teardown) => {
          if (!alive || token !== mine || mode !== "live") return teardown();
          live = teardown;
          emit(LAYOUT_EVENT);
        },
        () => {
          if (alive && token === mine) ask.still("load");
        },
      );
    };

    function apply(): void {
      if (!alive) return;
      const want = modeOf(reasons);
      if (want === mode) return report(want);
      keepPlace(() => {
        mode = want;
        report(want);
        if (want === "still") {
          token = null;
          live?.();
          live = null;
        } else startLive();
      });
      emit(LAYOUT_EVENT);
    }

    apply();
    return () => {
      alive = false;
      token = null;
      live?.();
      live = null;
      // A client navigation away leaves this markup for the next mount to find — StillDrawing reads
      // data-drawing on its own next render — so it must read exactly what a fresh boot script would choose
      // for the motion this module was built with, never this runtime's own reason ("load", say): that reason
      // belongs to this lifetime only, and J4-4 (still) is harmless to leave stale, but J5's live drawing is not.
      const motionState: MotionState = motion ? "on" : "off";
      const saverState: SaverState = html.dataset.saver === "on" ? "on" : "off";
      html.dataset.drawing = resolveDrawing(motionState, saverState, storedQuality());
      delete html.dataset.drawingWhy;
    };
  };
}

export const startDrawing = drawingModule(noLiveDrawing);
