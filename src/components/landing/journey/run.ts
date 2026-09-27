import { animate, onScroll, type JSAnimation, type ScrollObserver } from "animejs";
import { messages } from "@/messages";
import { readerPlace } from "./drawing-mode";
import { OWN_SCROLL, ownScroll } from "./focus-glide";
import { anchorOf, band, fitsRun, hereAt, layers, leanStep, offsets, runLayout, trainAt, type RunLayout } from "./geometry/run";
import { LAYOUT_EVENT, emit } from "./journey-events";
import { keepPlace, mastheadBottom } from "./keep-place";
import { SMOOTH } from "./motion-tokens";
import { track } from "./observers";
import type { JourneyContext, Teardown } from "./start-journey";
import { STATIONS, kmFigure } from "./stations";

// 06–07, the window-seat run (spec §3.A; prototype v3's run.js). The run pins (#run.is-running) and the scroll carries
// both sections sideways past a window along a line diagram: the rails, the kilometre posts and a platform per station
// at the train's pace, the far masts slower and the near posts faster, while the train holds its place at the window and
// the station at the window lights. The cards keep their words and links in reading order: Tab, and a link to 06 or 07
// (the departure board's), bring a station to the window, and on a touch screen each station is a resting point.
// Pinned only while the reader is not below the run (pinning grows it by its travel, which must land below them: J3's
// rule) and every station fits the window. Every pin, unpin and change of its height happens inside keepPlace (J5-3,
// J6-7). Motion off, a window too short, or a reader below it: the two sections read as they always did.

const RUNNING = "is-running";
const NS = "http://www.w3.org/2000/svg";
const PHONE = "(max-width: 47.99rem)";
const COARSE = "(pointer: coarse)";
const PLACE_EVENTS = ["scroll", "resize", LAYOUT_EVENT] as const;
const kmOf = (id: string): number => STATIONS.find((s) => s.id === id)?.km ?? 0;
const KM = { from: kmOf("features"), to: kmOf("use") };

function stroke(cls: string, d: string): SVGPathElement {
  const path = document.createElementNS(NS, "path");
  path.setAttribute("class", cls);
  path.setAttribute("d", d);
  return path;
}

export function startRun({ motion }: JourneyContext): Teardown {
  const run = document.getElementById("run");
  const pin = run?.querySelector<HTMLElement>(":scope > .run-pin");
  const trackEl = pin?.querySelector<HTMLElement>(":scope > .run-track");
  const far = pin?.querySelector<SVGSVGElement>(".run-far");
  const line = pin?.querySelector<SVGSVGElement>(".run-line");
  const near = pin?.querySelector<SVGSVGElement>(".run-near");
  const train = pin?.querySelector<HTMLElement>(":scope > .run-train");
  if (!motion || !run || !pin || !trackEl || !far || !line || !near || !train) return () => {};
  const glyph = train.querySelector<HTMLElement>(":scope > span");
  const stations = [...trackEl.querySelectorAll<HTMLElement>("[data-station]")];
  const sections = [...trackEl.querySelectorAll<HTMLElement>(":scope > section[id]")];
  const svgs = [far, line, near] as const;
  const state = { p: 0 };
  const marks: HTMLElement[] = [];
  let at: RunLayout | null = null;
  let driver: { readonly observer: ScrollObserver; readonly drive: JSAnimation } | null = null;
  let current = -1;
  let lastP = 0;
  let lean = 0;
  let waiting = false;
  let placeFrame = 0;
  let layoutFrame = 0;
  let aimed = -1; // the station a Tab stop's glide is bringing to the window, until it lands

  /** The scroll at which station i stands at the window: the run's start (its top under the masthead) plus its anchor. */
  const stationY = (i: number, layout: RunLayout): number =>
    Math.round(run.getBoundingClientRect().top + window.scrollY - mastheadBottom() + anchorOf(layout.centers[i] ?? layout.first, layout.first, layout.travel));

  /** The stations as the running layout lays them out (#run.is-running must be on), or null when they cannot fit. */
  const measure = (): RunLayout | null => {
    const h = pin.clientHeight;
    const w = pin.clientWidth;
    run.style.setProperty("--run-band", `${band(h)}px`);
    if (!fitsRun(stations.map((s) => s.offsetHeight), h, w)) return null;
    const origin = trackEl.getBoundingClientRect().left;
    const boxes = stations.map((s) => {
      const r = s.getBoundingClientRect();
      return { x0: r.left - origin, x1: r.right - origin };
    });
    return runLayout(boxes, { w, h, trainX: trainAt(w, window.matchMedia(PHONE).matches) });
  };

  const draw = (layout: RunLayout) => {
    const drawn = layers(layout, KM);
    const pairs = [
      [far, drawn.far],
      [line, drawn.line],
      [near, drawn.near],
    ] as const;
    for (const [svg, layer] of pairs) {
      svg.setAttribute("viewBox", `0 0 ${layer.span} ${layout.h}`);
      svg.style.width = `${layer.span}px`;
      svg.replaceChildren(...layer.strokes.map((s) => stroke(s.cls, s.d)));
    }
    for (const post of drawn.line.posts) {
      const label = document.createElementNS(NS, "text");
      label.setAttribute("class", "run-km");
      label.setAttribute("x", String(post.x));
      label.setAttribute("y", String(post.y));
      label.textContent = messages.journey.run.km(kmFigure(post.km));
      line.append(label);
    }
    drawn.line.stops.forEach((stop, i) => {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "run-stop");
      g.dataset.i = String(i);
      g.append(stroke("run-stroke is-platform", stop.platform), stroke("run-stroke is-tick", stop.tick));
      line.append(g);
    });
  };

  /** Everything the pinned run writes but its motion: its height, the train's place, the window's lines, where each
   * section stands, and on touch screens a resting point per station. */
  const place = (layout: RunLayout) => {
    const head = mastheadBottom();
    run.style.setProperty("--run-h", `${Math.round(layout.h + layout.travel)}px`);
    train.style.left = `${layout.trainX}px`;
    draw(layout);
    current = -1; // the stops were drawn afresh: light them again
    for (const section of sections) {
      const i = stations.findIndex((s) => section.contains(s));
      if (i < 0) continue;
      // the page y this section's top would have were it not riding the run (station-progress.ts reads it)
      section.dataset.runAt = String(stationY(i, layout) + head);
      section.tabIndex = -1; // a link to it focuses it in place (onClick)
    }
    for (const mark of marks.splice(0)) mark.remove();
    if (!window.matchMedia(COARSE).matches) return;
    for (const c of layout.centers) {
      const mark = document.createElement("i");
      mark.className = "run-snap";
      mark.setAttribute("aria-hidden", "true");
      mark.style.top = `${anchorOf(c, layout.first, layout.travel) - head}px`;
      run.append(mark);
      marks.push(mark);
    }
  };

  const clear = () => {
    run.style.removeProperty("--run-h");
    run.style.removeProperty("--run-band");
    train.style.removeProperty("left");
    glyph?.style.removeProperty("transform");
    trackEl.style.removeProperty("transform");
    for (const svg of svgs) {
      svg.replaceChildren();
      svg.removeAttribute("viewBox");
      svg.style.removeProperty("width");
      svg.style.removeProperty("transform");
    }
    for (const s of stations) s.classList.remove("is-here", "is-passed");
    for (const section of sections) {
      delete section.dataset.runAt;
      section.removeAttribute("tabindex");
    }
    for (const mark of marks.splice(0)) mark.remove();
    current = -1;
    lean = 0;
    lastP = 0;
    aimed = -1;
  };

  const paint = () => {
    const layout = at;
    if (!layout) return;
    const o = offsets(state.p, layout);
    trackEl.style.transform = `translate3d(${o.track.toFixed(1)}px,0,0)`;
    line.style.transform = `translate3d(${o.track.toFixed(1)}px,0,0)`;
    far.style.transform = `translate3d(${o.far.toFixed(1)}px,0,0)`;
    near.style.transform = `translate3d(${o.near.toFixed(1)}px,0,0)`;
    const here = hereAt(layout.first + state.p * layout.travel, layout.centers, layout.halves);
    if (here !== current) {
      current = here;
      stations.forEach((s, i) => {
        s.classList.toggle("is-here", i === here);
        s.classList.toggle("is-passed", i < here);
      });
      for (const stop of line.querySelectorAll<SVGGElement>(".run-stop")) stop.classList.toggle("is-lit", Number(stop.dataset.i) <= here);
    }
    lean = leanStep(lean, state.p - lastP, layout.travel);
    lastP = state.p;
    if (glyph) glyph.style.transform = Math.abs(lean) < 0.05 ? "" : `skewX(${lean.toFixed(2)}deg)`;
  };

  const startDriver = () => {
    const observer = track(onScroll({ target: run, enter: () => `top+=${mastheadBottom()} top`, leave: "bottom bottom", sync: SMOOTH }));
    const drive = animate(state, { p: [0, 1], ease: "linear", duration: 1000, onUpdate: paint, autoplay: observer });
    driver = { observer, drive };
  };
  const stopDriver = () => {
    driver?.drive.revert();
    driver?.observer.revert();
    driver = null;
  };

  /** Lays the run out and measures it, inside keepPlace; a run that cannot fit is put back. True when it fits. */
  const settle = (): boolean => {
    keepPlace(run, () => {
      run.classList.add(RUNNING);
      at = measure();
      if (at) place(at);
      else {
        run.classList.remove(RUNNING);
        clear();
      }
    });
    return at !== null;
  };
  const unpin = () => {
    stopDriver();
    keepPlace(run, () => {
      run.classList.remove(RUNNING);
      clear();
    });
    at = null;
  };

  const above = () => readerPlace(run.getBoundingClientRect(), window.innerHeight) === "above";
  const recheck = () => {
    if (placeFrame) return;
    placeFrame = requestAnimationFrame(() => {
      placeFrame = 0;
      if (above()) decide();
    });
  };
  const wait = (on: boolean) => {
    if (on === waiting) return;
    waiting = on;
    for (const type of PLACE_EVENTS) {
      if (on) window.addEventListener(type, recheck, { passive: true });
      else window.removeEventListener(type, recheck);
    }
  };
  /** Pinned only while the reader is not below the run: its growth must land below them (J3's rule; J6-7). */
  function decide(): void {
    if (!above()) {
      wait(true);
      return;
    }
    wait(false);
    if (!settle()) return;
    startDriver();
    paint();
    emit(LAYOUT_EVENT);
  }

  /** Anything that moves the page re-measures the pinned run, inside keepPlace; a run that no longer fits unpins. A
   * run not pinned (and no reader below it) tries again: a window that grew may fit now. */
  const relayout = () => {
    layoutFrame = 0;
    if (!at) {
      if (!waiting) decide();
      return;
    }
    const before = run.offsetHeight;
    if (!settle()) {
      stopDriver();
      emit(LAYOUT_EVENT);
      return;
    }
    driver?.observer.refresh();
    paint();
    if (aimed >= 0) reaim(at);
    if (run.offsetHeight !== before) emit(LAYOUT_EVENT);
  };
  const soon = () => {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(relayout);
  };

  // Tab onto a link in a card: bring its station to the window (the page's own scroll-behavior glides it).
  const onFocus = (event: FocusEvent) => {
    const layout = at;
    const station = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-station]") : null;
    const i = station ? stations.indexOf(station) : -1;
    if (!layout || i < 0) return;
    aimed = i;
    window.scrollTo({ top: stationY(i, layout) });
  };
  /** The glide can be cut short: a piece above moves the page (keepPlace; the drawing falling to the still under load),
   * and an instant scroll cancels a smooth one, leaving focus off-screen (WCAG 2.4.11). After a relayout its station
   * comes back to the window, while focus is still in it and the glide has neither landed nor met the reader's own
   * scroll. */
  function reaim(layout: RunLayout): void {
    const station = stations[aimed];
    if (!station?.contains(document.activeElement)) {
      aimed = -1;
      return;
    }
    window.scrollTo({ top: stationY(aimed, layout) });
  }
  const onScrollEnd = () => {
    if (aimed >= 0 && at && Math.abs(window.scrollY - stationY(aimed, at)) < 2) aimed = -1;
  };
  const onOwnScroll = (event: Event) => {
    if (ownScroll(event)) aimed = -1;
  };
  // A link to 06 or 07 (the departure board's): its first station to the window, the address, and focus in place (J6-8).
  const onClick = (event: MouseEvent) => {
    const layout = at;
    if (!layout || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
    const section = link ? sections.find((s) => link.hash === `#${s.id}`) : undefined;
    const i = section ? stations.findIndex((s) => section.contains(s)) : -1;
    if (!section || i < 0) return;
    event.preventDefault();
    window.history.pushState(null, "", `#${section.id}`);
    window.scrollTo({ top: stationY(i, layout) });
    section.focus({ preventScroll: true });
  };

  decide();
  window.addEventListener(LAYOUT_EVENT, soon);
  window.addEventListener("resize", soon);
  trackEl.addEventListener("focusin", onFocus);
  document.addEventListener("click", onClick);
  window.addEventListener("scrollend", onScrollEnd);
  for (const type of OWN_SCROLL) window.addEventListener(type, onOwnScroll, { passive: true });
  return () => {
    cancelAnimationFrame(placeFrame);
    cancelAnimationFrame(layoutFrame);
    wait(false);
    window.removeEventListener(LAYOUT_EVENT, soon);
    window.removeEventListener("resize", soon);
    trackEl.removeEventListener("focusin", onFocus);
    document.removeEventListener("click", onClick);
    window.removeEventListener("scrollend", onScrollEnd);
    for (const type of OWN_SCROLL) window.removeEventListener(type, onOwnScroll);
    if (!at) return;
    unpin();
    emit(LAYOUT_EVENT);
  };
}
