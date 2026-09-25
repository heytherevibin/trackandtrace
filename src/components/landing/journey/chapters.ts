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
// one dial, and the trace card prints each. Pinned only while every stop fits the window (fitsPinned); a fit
// that changes rebuilds the journey (tt:rebuild). Motion off: the plain section.

const m = messages.journey.chapters;

function headerOffset(): number {
  return Math.round(document.querySelector("header")?.getBoundingClientRect().height ?? 64);
}

function span(el: Element | null): Span | null {
  if (!el || getComputedStyle(el).display === "none") return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom };
}

// Keeps the reader's eye in place across any resize #how's pinning causes, however it happens. The pinned
// rule needs both html[data-motion="on"] and .is-pinned, so a Motion toggle collapses the height by the CSS
// selector alone, the instant <html data-motion> is rewritten — before this module's own teardown (which
// runs later, off the same tt:motion event) ever gets a turn to measure a "before". A ResizeObserver watches
// #how directly instead, reacting to a resize whatever caused it (this module's own fit toggle, the CSS
// selector on its own, or the browser's own hash landing before the journey ever ran). Its own live
// window.scrollY can no longer be trusted for "before" either, by the same problem one level up: the browser
// already adjusts the scroll position itself (anchoring or the plain physical clamp to a now-shorter page)
// as part of the very reflow the observer is reacting to, before its callback ever runs. So scrollY is kept
// one step behind instead, off the window's own "scroll" event, which reliably fires before the observer's
// callback: the value it holds when that event fires is still the reader's true, undisturbed position. Set
// up once per page and left running (#how never leaves the DOM).
let placeGuard: ResizeObserver | null = null;
let placeHeight = 0;
let placeDocTop = 0;
let lastScrollY = 0;
let placeSettle = 0;
let hashChecked = false;

/** A reader who follows a link straight to a section below #how has the browser's own fragment scroll land
 * before the journey ever runs (it resolves against the still-server-rendered, unpinned page): the first
 * resize here can leave it short, with the reader not yet past #how's own start at all — the general
 * "already past it" compensation below has nothing to correct, since there is nothing yet to preserve.
 * Settled once, the first time #how resizes, never again (a later toggle must not re-hijack a scroll the
 * reader has since made on their own). */
function settleHash(): void {
  if (hashChecked) return;
  hashChecked = true;
  const id = decodeURIComponent(location.hash.slice(1));
  const target = id ? document.getElementById(id) : null;
  target?.scrollIntoView({ block: "start", behavior: "instant" });
}

/** Re-measures #how against the last known height and compensates for whatever changed. Called from the
 * observer, and once more shortly after: the static layout the CSS collapses to does not always finish
 * settling within the same pass the observer catches (a second, small reflow can follow, uncaught by the
 * observer itself), so one follow-up check catches that tail without polling forever. */
function settlePlace(section: HTMLElement): void {
  const now = section.getBoundingClientRect();
  if (now.height === placeHeight) return;
  const delta = now.height - placeHeight;
  if (lastScrollY > placeDocTop) {
    lastScrollY += delta;
    // Set synchronously, not left for the "scroll" listener below: that event is delivered late (a
    // throttled task, not this frame), and #how can resize again within that window — a second correction
    // must add to where this one already put the reader, not silently to the stale, pre-correction position.
    window.scrollTo({ top: lastScrollY, behavior: "instant" });
  }
  placeHeight = now.height;
  settleHash();
  lastScrollY = window.scrollY;
}

function guardPlace(section: HTMLElement): void {
  if (placeGuard) return;
  const box = section.getBoundingClientRect();
  placeHeight = box.height;
  placeDocTop = box.top + window.scrollY;
  lastScrollY = window.scrollY;
  window.addEventListener("scroll", () => (lastScrollY = window.scrollY), { passive: true });
  placeGuard = new ResizeObserver(() => {
    settlePlace(section);
    window.clearTimeout(placeSettle);
    placeSettle = window.setTimeout(() => settlePlace(section), 150);
  });
  placeGuard.observe(section);
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
  if (!section || !dial) return () => {};
  guardPlace(section);
  if (!motion) return () => {};
  const pinned = fitsPinned(section);
  let refitTimer = 0;
  const onLayout = () => {
    window.clearTimeout(refitTimer);
    refitTimer = window.setTimeout(() => {
      if (fitsPinned(section) !== pinned) window.dispatchEvent(new Event(REBUILD_EVENT));
    }, 200);
  };
  window.addEventListener("resize", onLayout);
  window.addEventListener(LAYOUT_EVENT, onLayout);
  const stopListening = () => {
    window.clearTimeout(refitTimer);
    window.removeEventListener("resize", onLayout);
    window.removeEventListener(LAYOUT_EVENT, onLayout);
  };
  if (!pinned) return stopListening;

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
    stopListening();
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
    section.classList.remove("is-pinned");
  };
}
