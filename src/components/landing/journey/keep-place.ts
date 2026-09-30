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
  removeProbes();
  probes = { vh: probe("vh"), svh: probe("svh"), lvh: probe("lvh") };
  if (listeners.size > 0) connect(probes); // made again (something outside the journey took them): watched again
  return probes;
}

function removeProbes(): void {
  for (const el of Object.values(probes ?? {})) el.remove();
  probes = null;
  channel?.disconnect();
  channel = null;
  whole = null;
  ownGap = 0;
  window.clearTimeout(apartTimer);
  apartTimer = 0;
  apartAt = null;
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
/** The measures as the page last stood laid out for one window; its own 100vh less 100lvh (0 in every engine measured,
 * or what a browser whose default viewport is not its large one showed for APART_MS); and the timer that adopts measures
 * that have stood apart that long. */
let whole: Readonly<Partial<Record<Unit, number>>> | null = null;
let ownGap = 0;
let apartTimer = 0;
/** The measures the timer is counting for: it starts again when they move. */
let apartAt: Partial<Record<Unit, number>> | null = null;

function measures(): Partial<Record<Unit, number>> {
  const all = viewProbes();
  const now: Partial<Record<Unit, number>> = {};
  for (const unit of UNITS) {
    const px = all[unit].offsetHeight;
    if (px > 0) now[unit] = px;
  }
  return now;
}

/** The page as laid out for one window from now on; with `gap`, its own 100vh less 100lvh too (only measures that stood
 * apart for APART_MS set it: a single read may land between WebKit's steps). */
function adopt(now: Partial<Record<Unit, number>>, { gap = false }: { readonly gap?: boolean } = {}): true {
  whole = now;
  if (gap && now.vh !== undefined && now.lvh !== undefined) ownGap = now.vh - now.lvh;
  window.clearTimeout(apartTimer);
  apartTimer = 0;
  apartAt = null;
  return true;
}

function same(a: Partial<Record<Unit, number>> | null, b: Partial<Record<Unit, number>>): boolean {
  return a !== null && UNITS.every((unit) => a[unit] === b[unit]);
}

/** Whether the page is laid out for one window. WebKit lays a resize out in steps, a frame or more apart and in any
 * order, innerHeight the new window's throughout: what 100vh sizes (02's 330vh, the live drawing's 520vh), what 100svh
 * sizes (the still's columns, the run's pin) and 100lvh (where every timeline ends), mostly the last two together (the
 * nightly config's WebKit, 2026-09-30: split in 7 of 2,448 resizes under load). A place learned or a change answered
 * between them mixes two windows: 02's guard kept a fraction off by 33 px (review, M3), and answered a step alone while
 * the still's columns moved 40 px after it (open concern 3).
 *
 * The rule, over the units the page has (a probe that reads 0 is left out):
 * - 100vh less 100lvh is the page's own gap, within 1 px: 0 in every engine, whose default viewport is the large one.
 *   Checked on the page as it stands, so a step that lags a whole resize behind through a drag is still caught;
 * - and all of 100vh, 100svh and 100lvh have moved (more than 1 px) since the page was last laid out, or none has: a
 *   window's change moves all three, a phone's toolbar none. This catches 100svh landing in a step of its own.
 * Measures that stand still, and apart, for APART_MS are the page's own (a browser that moves one unit alone, or whose
 * default viewport is not its large one): adopted then, their gap with them, and every piece that waited is told
 * (watchView), so no place waits for good. */
export function laidOut(): boolean {
  const now = measures();
  const was = whole ?? now;
  const gapKept = now.vh === undefined || now.lvh === undefined || Math.abs(now.vh - now.lvh - ownGap) <= 1;
  const moved = UNITS.filter((unit) => {
    const [px, then] = [now[unit], was[unit]];
    return px !== undefined && then !== undefined && Math.abs(px - then) > 1;
  });
  const kept = UNITS.filter((unit) => now[unit] !== undefined && !moved.includes(unit));
  if (gapKept && (moved.length === 0 || kept.length === 0)) return adopt(now);
  whole = was;
  // counted afresh each time they move: only measures that have stood still, and apart, for APART_MS are the page's own,
  // never a drag's that lags behind for longer (the re-review, R2)
  if (!apartTimer || !same(apartAt, now)) {
    window.clearTimeout(apartTimer);
    apartAt = now;
    apartTimer = window.setTimeout(() => {
      apartTimer = 0;
      if (!probes) return;
      adopt(measures(), { gap: true });
      tell();
    }, APART_MS);
  }
  return false;
}

/** The pieces that keep a place across a resize, each with the element it keeps (its place in the document), what it
 * does when the page's measures of the window change, and whether that element's own size is watched too. */
interface Listener {
  readonly el: Element;
  readonly heard: () => void;
  readonly own: boolean;
}
const listeners = new Set<Listener>();
let channel: ResizeObserver | null = null;

/** Every listener, in document order: a piece above answers a change before a piece below it, as "resize" (heard before
 * any observer) let the live pin answer before 02's guard. 02's guard moves its reader to an absolute place; the live
 * pin moves a reader past it by its own change, so after 02's move it undid it (the review, H1). */
function tell(): void {
  laidOut(); // whether the page stands apart: its timer armed, or dropped
  const order = [...listeners].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  for (const listener of order) if (listeners.has(listener)) listener.heard();
}

/** One observer for every listener: the page's measures of the window, and each element whose own size is watched. */
function connect(all: Readonly<Record<Unit, HTMLElement>>): ResizeObserver {
  channel?.disconnect();
  channel = new ResizeObserver(tell);
  for (const unit of UNITS) channel.observe(all[unit]);
  for (const listener of listeners) if (listener.own) channel.observe(listener.el, { box: "border-box" });
  return channel;
}

/** Has `heard` told, in document order with every other piece's and through one observer, whenever the page's measures
 * of the window change size (the step that completes a resize, whichever it is, though nothing the piece watches changed
 * then), whenever `el` does when `own` is set, and when the page adopts measures that stood apart (laidOut). 02's guard,
 * started before any module, starts it, so its deliveries precede every module's own observer's (the run's pin,
 * answered last). Returns the unsubscribe. */
export function watchView(el: Element, heard: () => void, { own = false }: { readonly own?: boolean } = {}): () => void {
  const all = viewProbes();
  const listener: Listener = { el, heard, own };
  listeners.add(listener);
  const observer = channel ?? connect(all);
  if (own) observer.observe(el, { box: "border-box" });
  return () => {
    listeners.delete(listener);
    if (own && ![...listeners].some((l) => l.own && l.el === el)) channel?.unobserve(el);
    if (listeners.size === 0) {
      channel?.disconnect();
      channel = null;
    }
  };
}

/** Takes the page's measures of the window out of it: the journey calls it as it ends (start-journey.ts). */
export function dropViewProbes(): void {
  removeProbes();
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
