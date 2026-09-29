import { placeAfter, placeInProportion, readerPlace, type Shape } from "./drawing-mode";
import { JUMP_EVENT, emit } from "./journey-events";

// The one way a pinned piece changes its own height (J5-3): the change runs, then the reader lands where placeAfter
// says, judged from the piece's box just before. drawing.ts (the live drawing's pin) and run.ts (the window-seat run's)
// change their heights only through here. It writes the scroll only.

export function mastheadBottom(): number {
  return Math.round(document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
}

/** An instant scroll to `top`, unless the reader already stands within a pixel of it. Any instant scroll, even to where
 * they are, cancels a smooth one in flight: the glide that brings a Tab stop into the window stopped short, focus
 * off-screen (WCAG 2.4.11), when the drawing above fell to the still and scroll anchoring had already answered it. A jump
 * it does make is announced (JUMP_EVENT), so a glide it cut short is taken up again (focus-glide.ts, run.ts). */
export function jumpTo(top: number): void {
  if (Math.abs(top - window.scrollY) < 1) return;
  window.scrollTo({ top, behavior: "instant" });
  emit(JUMP_EVENT);
}

/** Where the reader last read a piece, kept by its caller: its box in the page, their scroll, and the window's height. */
export interface ReadPlace {
  readonly top: number;
  readonly bottom: number;
  readonly y: number;
  readonly vh: number;
}

export interface KeepOptions {
  /** Whether the change kept the piece's shape (a relayout: a reader inside it stays the same fraction through it) or
   * changed it (the default: they land on its start). A function is asked once the change has run, for a caller that
   * learns it only then (the run: does it still fit?). */
  readonly shape?: Shape | (() => Shape);
  /** Where the reader last read the piece, for a change the page has already laid out before its caller heard of it (a
   * resize: the window, and the pieces above, have moved by then). The reader is judged by it, and a reader inside is
   * kept the same fraction through from it; a reader past is still moved by the change from where they stand now. */
  readonly from?: ReadPlace;
}

/** Runs a change to the piece, then puts the reader where placeAfter says. A piece already gone from the document (a
 * client navigation away) just changes. */
export function keepPlace(section: HTMLElement | null, change: () => void, { shape = "changed", from }: KeepOptions = {}): void {
  if (!section?.isConnected) {
    change();
    return;
  }
  const before = section.getBoundingClientRect();
  const scrollY = window.scrollY;
  change();
  const after = section.getBoundingClientRect();
  const kept = typeof shape === "function" ? shape() : shape;
  const masthead = mastheadBottom();
  if (from && readerPlace({ top: from.top - from.y, bottom: from.bottom - from.y }, from.vh) === "inside") {
    const top = after.top + window.scrollY;
    jumpTo(
      kept === "same"
        ? placeInProportion({ top: from.top, bottom: from.bottom, landing: masthead, viewport: from.vh }, { top, bottom: top + after.height, landing: masthead, viewport: window.innerHeight }, from.y)
        : Math.round(top - masthead),
    );
    return;
  }
  if (from && readerPlace({ top: from.top - from.y, bottom: from.bottom - from.y }, from.vh) === "above") return;
  // A shrink near the page's foot clamps the scroll as the change lays out: its box is then read against the clamped
  // scroll, and put back against the one before, so a reader inside it still lands on its start.
  const drift = window.scrollY - scrollY;
  const to = placeAfter(before, { top: after.top + drift, height: after.height }, { scrollY, viewport: window.innerHeight, masthead }, kept);
  if (to !== null) jumpTo(to);
}
