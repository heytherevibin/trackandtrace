import { animate, onScroll, stagger, utils, type JSAnimation } from "animejs";
import { MOTION_BEFORE_EVENT, MOTION_EVENT } from "@/components/motion/use-motion";
import { messages } from "@/messages";
import { formatPnr } from "@/utils/pnr";
import { barWidth, chapterAt, stepLit, typedCount } from "./chapters-progress";
import { placeInProportion, readerPlace } from "./drawing-mode";
import { ease } from "./ease";
import { fitsWindow, type Span } from "./fit";
import { LAYOUT_EVENT, REBUILD_EVENT } from "./journey-events";
import { jumpTo, laidOut, viewHeight, watchView } from "./keep-place";
import { SMOOTH, STAGGER, T } from "./motion-tokens";
import { keepUp, track } from "./observers";
import type { JourneyContext, Teardown } from "./start-journey";

// 02 pinned (spec §3.A): the section holds under the masthead while the scroll plays its three stops inside
// one dial, and the trace card prints each. Pinned only while every stop fits the window (fitsPinned), and only
// while #how's top is at or below the window's top: pinning grows it by up to 330vh, and that growth must land
// below the reader, never under them. A reader below it (a "/#faq" link, or a scroll past it) leaves 02 pending
// until they come back above it; it then pins in place, starting only its own driver. Fragments land before the
// journey decides (journey.css makes them instant until then), so the reader is never mid-glide when it does.
// A pinned 02 that stops fitting rebuilds the journey (tt:rebuild). Motion off: the plain section.

const m = messages.journey.chapters;

function headerOffset(): number {
  return Math.round(document.querySelector("header")?.getBoundingClientRect().height ?? 64);
}

function span(el: Element | null): Span | null {
  if (!el || getComputedStyle(el).display === "none") return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom };
}

// Keeps the reader in the part of the page they were in whenever #how changes size: Motion off (the footer
// switch, the device, another tab) collapses the pinned height by the CSS selector alone, before any module's
// teardown gets a turn, and a resize or a turned phone refits it. The collapse lands in two frames: the height
// at once, then the padding one frame later (Motion off's 0.01ms transitions, motion.css), which only the
// border box shows. #how is measured afresh each time, against the box this guard last saw (its document top
// moves with the window's width). By then the browser has already moved window.scrollY for the same reflow
// (scroll anchoring, or clamping to the shorter page), so the reader's position is kept one step behind: off
// "scroll" events while #how is the size this guard last settled, and read afresh just before Motion rewrites
// the page. A "scroll" event can land after #how changed size and before the observer settles it (the reader's
// last scroll had not reached a frame yet: a slow device); it reports the browser's move, never the reader's.
/** #how's box in document coordinates, measured now. */
function docBox(section: HTMLElement): Span {
  const r = section.getBoundingClientRect();
  return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
}

/** Where the reader was, the window they saw it in, and #how's document box, landing and shape then: the guard's state,
 * kept in its closure. The window is kept with the scroll: a resize is judged against the window the reader read in,
 * never the one it just made (a plain 02 on a short window is mostly what they see; on a tall one, its foot is in the
 * top half). */
interface Place {
  readonly box: Span;
  readonly y: number;
  readonly vh: number;
  /** The large viewport's height, where 02's timeline ends (viewHeight): the fraction is measured on its basis. */
  readonly view: number;
  /** #how's scroll-margin-top: how far below the window's top its start lands, for a change of shape. */
  readonly landing: number;
  /** The masthead's height: how far below the window's top 02's timeline starts (startDriver), for a resize, so the
   * fraction kept is the timeline's own progress (review, nit: its scroll margin is 1rem more). */
  readonly lead: number;
  readonly shape: string;
}

/** 02 pinned, by the very selector that pins it (journey-island.css). */
const PINNED = 'html[data-motion="on"][data-journey="on"] .chapters.is-pinned';

/** What #how is, as against how big: Motion, and whether it stands pinned. A change of either (Motion off or on, 02
 * unpinned by a rebuild once it no longer fits) is a change of shape; a resize or a relayout of the same shape is not.
 * Read from the page, not from the event that caused it: Motion's rewrite of <html data-motion> collapses #how by the
 * selector alone, and a rebuild's unpin reaches this guard only as a resize. */
function shapeOf(section: HTMLElement): string {
  return `${document.documentElement.dataset.motion ?? ""} ${section.matches(PINNED) ? "pinned" : "plain"}`;
}

function landingOf(section: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
}

/** #how as it stands now, with the reader's scroll and window: the place a change is judged from. */
function placeNow(section: HTMLElement): Place {
  return { box: docBox(section), y: window.scrollY, vh: window.innerHeight, view: viewHeight(), landing: landingOf(section), lead: headerOffset(), shape: shapeOf(section) };
}

/** Above 02's old start: nothing. Inside it (over half the window in it): the same fraction of the way through it when
 * its shape is the same (a resize: the owner, 2026-09-29), measured as its timeline measures it (from under the
 * masthead to the large viewport's foot), so the same stop and frame come back; its new start, at its
 * landing under the masthead, when its shape changed. Past it (its foot within the window's top half, what follows on
 * screen): the same distance past its new end (the height's change, plus its top's when the width moved it). Judged by
 * readerPlace, the rule every piece uses (J6-4): the window's top edge alone sent a reader in 02's last lines, #record
 * on screen, back to its start. Returns the place to judge the next change from. */
function settlePlace(section: HTMLElement, was: Place): Place {
  const now = placeNow(section);
  const { y } = was;
  const where = readerPlace({ top: was.box.top - y, bottom: was.box.bottom - y }, was.vh);
  // through jumpTo, as every place-keeping move: announced, so a Tab stop's glide it cuts short is taken up again
  if (where === "past") jumpTo(y + now.box.bottom - was.box.bottom);
  else if (where === "inside" && now.shape !== was.shape) jumpTo(now.box.top - now.landing);
  else if (where === "inside") jumpTo(placeInProportion({ ...was.box, landing: was.lead, viewport: was.view }, { ...now.box, landing: now.lead, viewport: now.view, start: now.landing }, y));
  return placeNow(section);
}

/** #how's own border-box size, at the same precision a ResizeObserver entry reports (never offsetWidth/
 * offsetHeight's rounded integers, or a genuine sub-pixel resize would misread as unchanged). */
function sizeOf(section: HTMLElement): { readonly width: number; readonly height: number } {
  const r = section.getBoundingClientRect();
  return { width: r.width, height: r.height };
}

/** Started once, for the journey's whole lifetime (start-journey.ts calls this: it must already be watching
 * when a Motion toggle collapses #how, and survive the rebuild that follows), and stopped only with it. */
export function startPlaceGuard(): Teardown {
  const section = document.getElementById("how");
  if (!section) return () => {};
  let place: Place = placeNow(section);
  let lastSize = sizeOf(section);
  const unchanged = () => {
    const size = sizeOf(section);
    return size.width === lastSize.width && size.height === lastSize.height;
  };
  // The reader's place, only while #how is still the size this guard last settled; and the window they read it in only
  // while the page is laid out for one (laidOut): between WebKit's steps of a resize, the new window's size with
  // #how's box still the old one's put the fraction off by 33 px (review, M3).
  const learn = () => {
    if (!unchanged()) return;
    place = laidOut() ? { ...place, y: window.scrollY, vh: window.innerHeight, view: viewHeight() } : { ...place, y: window.scrollY };
  };
  window.addEventListener("scroll", learn, { passive: true });
  window.addEventListener(MOTION_BEFORE_EVENT, learn);
  // The drawing above 02 (GA, J5) pins and unpins, which moves #how's document box without resizing it, and moves
  // its reader with it by an instant scroll before it tells tt:layout. While #how is the size this guard last
  // settled, every layout change refreshes the box it judges against, and the reader's scroll with it: that move's
  // own "scroll" event lands a frame later, and a resize judged before it would read the reader's old place against
  // the new box. A change that did resize #how is the observer's, below, and must be judged against the box from
  // before it. A dependency every piece below 02 carries: one that moves the reader in a rebuild (the run's unpin,
  // run.ts) must tell tt:layout after its move, so this refresh learns the scroll it left; else 02's own resize, a
  // frame later, is judged from the scroll before that move, and undoes it.
  const refresh = () => {
    if (!unchanged()) return;
    const now = placeNow(section);
    place = laidOut() ? now : { ...now, vh: place.vh, view: place.view };
  };
  window.addEventListener(LAYOUT_EVENT, refresh);
  // A freshly observed target always delivers one initial notification, even when nothing has actually
  // changed (the spec guarantees it) — this observer never fires on its own just because something above
  // #how changed size and moved it; only #how's own border-box actually changing size does that, or this
  // guaranteed-but-empty first delivery. Treating that first delivery as a real resize (the previous bug
  // here) reads whatever #how's box happens to be at that moment — including a document position already
  // shifted by content above it, before #how itself ever resized — as #how's own change, and relocates a
  // reader who never left where they were reading. The box this guard compares against still refreshes every
  // time (so a later, real resize is judged from here, never a stale one) — only the relocation itself waits
  // for #how's own box to actually change size.
  // Settled only once the page is laid out for one window: WebKit's first step of a resize (laidOut) is answered with the
  // second, which the observer hears through the page's measures of the window (watchView) whichever step it is, so the
  // move covers every change above #how's foot, the still's columns included (still.ts counts on that).
  // A change of shape (Motion's switch) settles at once, laid out or not: its move (the start, or the change past it) uses
  // no window height, and waiting let the run's unpin, made before, be undone by it (J6-7; the review, M1). The window
  // learned then is the one kept before.
  const settle = (shape = false) => {
    const whole = laidOut();
    if (!whole && !shape) return;
    const resized = !unchanged();
    lastSize = sizeOf(section);
    const next = resized ? settlePlace(section, place) : { ...place, box: docBox(section), landing: landingOf(section), lead: headerOffset(), shape: shapeOf(section) };
    place = whole ? next : { ...next, vh: place.vh, view: place.view };
  };
  // #how's own size and the page's measures of the window, through the journey's one observer of them, in document
  // order with the pieces above and below (keep-place.ts): the live pin above answers first, the run below last.
  const stopView = watchView(section, () => settle(), { own: true });
  // Motion's rewrite collapses 02 at once, and the journey's rebuild then tears down the pieces below it: the run's
  // unpin moves the reader by its own change (keepPlace), from wherever they stand by then. Settled here, as Motion
  // changes and before the rebuild (this listener is added first), 02's move is made first and the run's lands on it;
  // settled by the observer a frame later, from the place kept before both, it would undo the run's (J6-7). That
  // holds only while the run tells tt:layout after its move (refresh, above).
  const settleShape = () => settle(true);
  window.addEventListener(MOTION_EVENT, settleShape);
  return () => {
    window.removeEventListener("scroll", learn);
    window.removeEventListener(MOTION_BEFORE_EVENT, learn);
    window.removeEventListener(MOTION_EVENT, settleShape);
    window.removeEventListener(LAYOUT_EVENT, refresh);
    stopView();
  };
}

/** Pins the section, opens each stop in turn, and keeps the pin only if every stop fits the window. */
function fitsPinned(section: HTMLElement): boolean {
  section.classList.add("is-pinned");
  const pin = section.querySelector(".chapters-pin");
  const items = [...section.querySelectorAll<HTMLElement>("li[data-chapter]")];
  const was = items.map((li) => li.classList.contains("is-current"));
  const pr = pin?.getBoundingClientRect();
  const ok =
    pr !== undefined &&
    items.every((open) => {
      items.forEach((li) => li.classList.toggle("is-current", li === open));
      const parts = [span(section.querySelector(".chapters-copy")), span(section.querySelector(".chapters-instrument"))];
      return fitsWindow(parts, { top: pr.top, bottom: pr.bottom }, pr.top + window.innerHeight - headerOffset());
    });
  items.forEach((li, k) => li.classList.toggle("is-current", was[k] ?? false));
  if (!ok) section.classList.remove("is-pinned");
  return ok;
}

export function startChapters({ motion }: JourneyContext): Teardown {
  const section = document.getElementById("how");
  const dial = section?.querySelector<SVGSVGElement>(".chapters-dial svg");
  if (!section || !dial || !motion) return () => {};
  let stopDriver: Teardown | null = null;
  let refitTimer = 0;

  // Unpinned: pending while the reader is below #how's top, otherwise pinned in place if every stop fits.
  const decide = (announce: boolean) => {
    if (section.getBoundingClientRect().top < 0) {
      startPending();
      return;
    }
    stopPending();
    if (!fitsPinned(section)) return;
    stopDriver = startDriver(section, dial);
    // The growth lands below the reader: only the journey's observers need to measure it again.
    if (announce) window.dispatchEvent(new Event(LAYOUT_EVENT));
  };
  const recheck = () => {
    if (section.getBoundingClientRect().top >= 0) decide(true);
  };
  const startPending = () => {
    window.addEventListener("scroll", recheck, { passive: true });
    window.addEventListener("resize", recheck);
    window.addEventListener(LAYOUT_EVENT, recheck);
  };
  const stopPending = () => {
    window.removeEventListener("scroll", recheck);
    window.removeEventListener("resize", recheck);
    window.removeEventListener(LAYOUT_EVENT, recheck);
  };
  const onLayout = () => {
    window.clearTimeout(refitTimer);
    refitTimer = window.setTimeout(() => {
      if (!stopDriver) decide(true);
      else if (!fitsPinned(section)) window.dispatchEvent(new Event(REBUILD_EVENT));
    }, 200);
  };

  decide(false);
  window.addEventListener("resize", onLayout);
  window.addEventListener(LAYOUT_EVENT, onLayout);
  return () => {
    window.clearTimeout(refitTimer);
    window.removeEventListener("resize", onLayout);
    window.removeEventListener(LAYOUT_EVENT, onLayout);
    stopPending();
    stopDriver?.();
    section.classList.remove("is-pinned");
  };
}

/** 02's own driver, on a section already pinned: the scroll observer that plays the three stops, and the
 * render. Its teardown puts the server's markup back (the caller removes .is-pinned). */
function startDriver(section: HTMLElement, dial: SVGSVGElement): Teardown {
  const q = <E extends Element>(sel: string) => [...section.querySelectorAll<E>(sel)];
  const items = q<HTMLElement>("li[data-chapter]");
  const arcs = q<SVGPathElement>(".chapter-arc");
  const labels = q<SVGTextElement>(".chapter-label");
  const layers = q<SVGGElement>("[data-layer]");
  const cards = q<HTMLElement>("pre[data-card]");
  const segs = [...dial.querySelectorAll<SVGPathElement>(".dial-seg")];
  const bars = q<SVGRectElement>(".chapter-bar");
  const steps = q<SVGCircleElement>(".chapter-step");
  const count = section.querySelector<HTMLElement>(".chapter-step-count");
  const digits = section.querySelector<SVGTextElement>(".chapter-digits");
  const pulse = section.querySelector<SVGCircleElement>(".chapter-pulse");
  const sweep = dial.querySelector<SVGPathElement>(".dial-sweep");
  const dashed = dial.querySelector<SVGCircleElement>(".is-dashed");
  const marker = section.querySelector<HTMLElement>(".rail-marker");
  const pnr = dial.dataset.pnr ?? "";
  const flourish: JSAnimation[] = [];
  const state = { p: 0 };
  let current = -1;

  const enter = (i: number) => {
    items.forEach((li, k) => li.classList.toggle("is-current", k === i));
    arcs.forEach((a, k) => a.classList.toggle("is-on", k <= i));
    labels.forEach((l, k) => l.classList.toggle("is-steel", k === i));
    layers.forEach((g, k) => g.classList.toggle("is-current", k === i));
    cards.forEach((c, k) => c.classList.toggle("is-current", k === i));
    if (count) count.textContent = m.step(i + 1, 3);
    const shown = [...(layers[i]?.querySelectorAll("text, rect") ?? [])];
    if (shown.length) flourish.push(animate(shown, { translateY: [10, 0], delay: stagger(i === 1 ? STAGGER.char : STAGGER.row), duration: T.base, ease: ease.expo() }));
  };
  const render = () => {
    const { i, t } = chapterAt(state.p);
    if (i !== current) {
      current = i;
      enter(i);
    }
    if (marker) marker.style.left = `${(state.p * 100).toFixed(2)}%`;
    const typed = i === 0 ? typedCount(t) : 10;
    segs.forEach((s, k) => {
      s.classList.toggle("is-on", k < typed);
      s.classList.toggle("is-current", k === typed && typed < 10);
    });
    if (i === 0 && digits) digits.textContent = typed ? formatPnr(pnr.slice(0, typed)) : m.noDigits;
    if (i === 1) {
      bars.forEach((b, k) => {
        const w = barWidth(k, t);
        b.setAttribute("x", (-w / 2).toFixed(1));
        b.setAttribute("width", w.toFixed(1));
      });
      pulse?.setAttribute("cx", (-190 + 380 * t).toFixed(1));
      steps.forEach((s, k) => (s.style.opacity = stepLit(k, t) ? "1" : "0.25"));
    }
    if (sweep) {
      sweep.style.opacity = i === 1 ? "1" : "0";
      sweep.style.transform = i === 1 ? `rotate(${(t * 300).toFixed(1)}deg)` : "";
    }
  };

  const observer = track(onScroll({ target: section, enter: () => `top+=${headerOffset()} top`, leave: "bottom bottom", sync: SMOOTH }));
  const drive = animate(state, { p: [0, 1], ease: "linear", duration: 1000, onUpdate: render, autoplay: observer });
  const ring = dashed ? animate(dashed, { rotate: "-=360", duration: 90_000, loop: true, ease: "linear" }) : null;
  const awake = keepUp(observer, () => state.p); // the stops catch the scroll up though a frame outlasts anime's wake
  render();

  return () => {
    awake();
    drive.revert();
    observer.revert();
    ring?.revert();
    // Newest first: a re-entered stop's flourish takes the last one's landed value as its "original".
    for (const f of [...flourish].reverse()) f.revert();
    utils.remove([...segs, ...bars]);
    items.forEach((li) => li.classList.remove("is-current"));
    arcs.forEach((a) => a.classList.remove("is-on"));
    labels.forEach((l) => l.classList.remove("is-steel"));
    layers.forEach((g, k) => g.classList.toggle("is-current", k === 0));
    cards.forEach((c, k) => c.classList.toggle("is-current", k === 0));
    segs.forEach((s) => s.classList.remove("is-on", "is-current"));
    bars.forEach((b) => {
      b.setAttribute("x", "-120");
      b.setAttribute("width", "240");
    });
    pulse?.setAttribute("cx", "-190");
    steps.forEach((s) => s.style.removeProperty("opacity"));
    sweep?.style.removeProperty("opacity");
    sweep?.style.removeProperty("transform");
    marker?.style.removeProperty("left");
    if (count) count.textContent = m.step(1, 3);
    if (digits) digits.textContent = m.noDigits;
  };
}
