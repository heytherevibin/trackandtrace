import { animate, onScroll, stagger, utils, type JSAnimation } from "animejs";
import { messages } from "@/messages";
import { formatPnr } from "@/utils/pnr";
import { barWidth, chapterAt, stepLit, typedCount } from "./chapters-progress";
import { ease } from "./ease";
import { fitsWindow, type Span } from "./fit";
import { LAYOUT_EVENT, REBUILD_EVENT } from "./journey-events";
import { SMOOTH, STAGGER, T } from "./motion-tokens";
import { track } from "./observers";
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

// Keeps the reader's eye in place across the one resize #how makes while they are below it: Motion off
// collapses the pinned height by the CSS selector alone (it needs html[data-motion="on"] as well as
// .is-pinned), the instant <html data-motion> is rewritten, before any module's teardown gets a turn. The
// collapse lands in two frames: the height at once, then the section's padding one frame later (Motion off's
// 0.01ms transitions, motion.css), which only the border box shows. By then the browser has already moved
// window.scrollY for the same reflow, so the reader's position is kept one step behind, off "scroll" events.
let placeHeight = 0;
let placeDocTop = 0;
let lastScrollY = 0;

function settlePlace(section: HTMLElement): void {
  const height = section.getBoundingClientRect().height;
  const delta = height - placeHeight;
  placeHeight = height;
  if (delta !== 0 && lastScrollY > placeDocTop) window.scrollTo({ top: lastScrollY + delta, behavior: "instant" });
  lastScrollY = window.scrollY;
}

/** Started once, for the journey's whole lifetime (start-journey.ts calls this: it must already be watching
 * when a Motion toggle collapses #how, and survive the rebuild that follows), and stopped only with it. */
export function startPlaceGuard(): Teardown {
  const section = document.getElementById("how");
  if (!section) return () => {};
  const box = section.getBoundingClientRect();
  placeHeight = box.height;
  placeDocTop = box.top + window.scrollY;
  lastScrollY = window.scrollY;
  const onScroll = () => (lastScrollY = window.scrollY);
  window.addEventListener("scroll", onScroll, { passive: true });
  const observer = new ResizeObserver(() => settlePlace(section));
  observer.observe(section, { box: "border-box" });
  return () => {
    window.removeEventListener("scroll", onScroll);
    observer.disconnect();
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
  render();

  return () => {
    drive.revert();
    observer.revert();
    ring?.revert();
    for (const f of flourish) f.revert();
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
