import { placeAfter, placeInProportion, readerPlace, type Shape } from "./drawing-mode";
import { JUMP_EVENT, emit } from "./journey-events";

// The one way a pinned piece changes its own height (J5-3): the change runs, then the reader lands where placeAfter
// says, judged from the piece's box just before. drawing.ts (the live drawing's pin) and run.ts (the window-seat run's)
// change their heights only through here. It writes the scroll only.

export function mastheadBottom(): number {
  return Math.round(document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
}

/** The page's own measures of the window as laid out now, 100vh, 100svh and 100lvh: kept in the page, hidden and out of
 * flow, for the journey's life (dropViewProbes), so reading them costs no more than the layout the caller has already
 * read. */
const UNITS = ["vh", "svh", "lvh"] as const;
type Unit = (typeof UNITS)[number];
let probes: Readonly<Record<Unit, HTMLElement>> | null = null;

function probe(unit: Unit): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:absolute;top:0;left:0;width:0;visibility:hidden;pointer-events:none;overflow-anchor:none";
  el.style.height = `100${unit}`;
  document.body.append(el);
  return el;
}

function viewProbes(): Readonly<Record<Unit, HTMLElement>> {
  if (probes && UNITS.every((unit) => probes?.[unit].isConnected)) return probes;
  dropViewProbes();
  probes = { vh: probe("vh"), svh: probe("svh"), lvh: probe("lvh") };
  return probes;
}

/** The large viewport's height (100lvh): the window every scroll timeline here ends at, as anime's scroll observers
 * measure it (a 100lvh probe), a phone's toolbar shown or not; the window's own where the page has no lvh. A place kept
 * in proportion is measured on the same basis, so its fraction is the timeline's progress (review, M1). Read from the
 * layout each time, never kept by the window's size: WebKit tells the new size before it lays out the large viewport for
 * it, and a value kept then was the old window's until the next "resize". */
export function viewHeight(): number {
  return viewProbes().lvh.offsetHeight || window.innerHeight;
}

/** How long the page's measures of the window may stay apart (laidOut) before that is the page's own shape, not WebKit
 * between its steps: those land a frame or more apart, about 60 ms at most in the nightly config's WebKit under load
 * (2026-09-30). */
export const APART_MS = 1000;
/** The measures as the page last stood laid out for one window, and since when they have stood apart from it. */
let whole: Readonly<Partial<Record<Unit, number>>> | null = null;
let apartSince: number | null = null;

/** Whether the page is laid out for one window. WebKit lays a resize out in steps, a frame or more apart and in any
 * order, innerHeight the new window's throughout: what 100vh sizes (02's 330vh, the live drawing's 520vh), what 100svh
 * sizes (the still's columns, the run's pin) and 100lvh (where every timeline ends), mostly the last two together (the
 * nightly config's WebKit, 2026-09-30: split in 7 of 2,448 resizes under load). A place learned or a change answered
 * between them mixes two windows: 02's guard kept a fraction off by 33 px (review, M3), and answered a step alone while
 * the still's columns moved 40 px after it (open concern 3). A window's change moves all three measures, and a phone's
 * toolbar none, so the page is laid out while they have all moved since it last was, or none has. A unit the page lacks
 * is left out, and measures that stay apart past APART_MS are the page's own (a browser that resizes one unit alone):
 * waiting for them then would keep no place at all. */
export function laidOut(): boolean {
  const all = viewProbes();
  const now: Partial<Record<Unit, number>> = {};
  for (const unit of UNITS) {
    const px = all[unit].offsetHeight;
    if (px > 0) now[unit] = px;
  }
  const was = whole;
  const moved = UNITS.filter((unit) => {
    const [px, then] = [now[unit], was?.[unit]];
    return px !== undefined && then !== undefined && Math.abs(px - then) > 1;
  });
  const kept = UNITS.filter((unit) => now[unit] !== undefined && !moved.includes(unit));
  if (!was || moved.length === 0 || kept.length === 0 || (apartSince !== null && performance.now() - apartSince > APART_MS)) {
    whole = now;
    apartSince = null;
    return true;
  }
  apartSince ??= performance.now();
  return false;
}

/** Has `observer` watch the page's measures of the window: it hears the step that completes a resize (laidOut), whichever
 * it is, though nothing it watches itself changed size then. */
export function watchView(observer: ResizeObserver): void {
  for (const el of Object.values(viewProbes())) observer.observe(el);
}

/** Takes the page's measures of the window out of it: the journey calls it as it ends (start-journey.ts). */
export function dropViewProbes(): void {
  for (const el of Object.values(probes ?? {})) el.remove();
  probes = null;
  whole = null;
  apartSince = null;
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

/** Where the reader last read a piece, kept by its caller: its box in the page, their scroll, the window's height (what
 * they saw), and the large viewport's (where its timeline ends: viewHeight). */
export interface ReadPlace {
  readonly top: number;
  readonly bottom: number;
  readonly y: number;
  readonly vh: number;
  readonly view: number;
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
        ? placeInProportion({ top: from.top, bottom: from.bottom, landing: masthead, viewport: from.view }, { top, bottom: top + after.height, landing: masthead, viewport: viewHeight() }, from.y)
        : Math.round(top - masthead),
    );
    return;
  }
  if (from && readerPlace({ top: from.top - from.y, bottom: from.bottom - from.y }, from.vh) === "above") return;
  // A shrink near the page's foot clamps the scroll as the change lays out: its box is then read against the clamped
  // scroll, and put back against the one before, so a reader inside it still lands on its start.
  const drift = window.scrollY - scrollY;
  const view = viewHeight();
  const to = placeAfter(before, { top: after.top + drift, height: after.height }, { scrollY, viewport: window.innerHeight, view, viewAfter: view, masthead }, kept);
  if (to !== null) jumpTo(to);
}
