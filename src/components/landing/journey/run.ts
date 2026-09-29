import { animate, onScroll, type JSAnimation, type ScrollObserver } from "animejs";
import { messages } from "@/messages";
import { readerPlace } from "./drawing-mode";
import { keyboardFocus, watchGlide, watchTab } from "./focus-glide";
import { anchorOf, band, fitsRun, hereAt, layers, leanStep, offsets, runLayout, trainAt, type RunLayout } from "./geometry/run";
import { LAYOUT_EVENT, emit } from "./journey-events";
import { keepPlace, mastheadBottom, type ReadPlace } from "./keep-place";
import { SMOOTH } from "./motion-tokens";
import { keepUp, refreshObserver, track } from "./observers";
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

/** y lies within a pixel of the span from `a` to `b`, either way round. */
function between(y: number, a: number, b: number): boolean {
  return y >= Math.min(a, b) - 1 && y <= Math.max(a, b) + 1;
}

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
  let driver: { readonly observer: ScrollObserver; readonly drive: JSAnimation; readonly awake: () => void } | null = null;
  let current = -1;
  let lastP = 0;
  let lean = 0;
  let waiting = false;
  let placeFrame = 0;
  let layoutFrame = 0;
  let aimed = -1; // the station a Tab stop's glide is bringing to the window, while watch is armed for it

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
    watch.disarm();
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
    // a jump's glide to a station, finished though a frame outlasts anime's wake (a slow device)
    driver = { observer, drive, awake: keepUp(observer, () => state.p) };
  };
  const stopDriver = () => {
    driver?.awake();
    driver?.drive.revert();
    driver?.observer.revert();
    driver = null;
  };

  /** Lays the run out and measures it, inside keepPlace; a run that cannot fit is put back. True when it fits. A run
   * running before and after is a relayout, which keeps its shape: a reader inside it stays the same fraction through
   * it, so on the same station (the owner, 2026-09-29). Its first pin, and a failure to fit, change its shape: its start.
   * `from`: where the reader last read it, for a resize the page has already laid out (onPin, below). */
  const settle = (from?: ReadPlace): boolean => {
    const was = at !== null;
    keepPlace(
      run,
      () => {
        run.classList.add(RUNNING);
        at = measure();
        if (at) place(at);
        else {
          run.classList.remove(RUNNING);
          clear();
        }
      },
      { shape: () => (was && at !== null ? "same" : "changed"), from },
    );
    read = null;
    learn();
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
    aim();
  }

  /** Anything that moves the page re-measures the pinned run, inside keepPlace; a run that no longer fits unpins. A
   * run not pinned (and no reader below it) tries again: a window that grew may fit now. A resize of the running run is
   * its pin's observer's (onPin), never this frame's: `from` is the place the reader last read it in, which only that
   * observer passes. */
  const relayout = (from?: ReadPlace) => {
    layoutFrame = 0;
    if (!at) {
      if (!waiting) decide();
      return;
    }
    if (!from && !steady()) return;
    const before = run.offsetHeight;
    if (!settle(from)) {
      stopDriver();
      emit(LAYOUT_EVENT);
      return;
    }
    // through observers.ts's door: the run can pin in a frame whose queued layout change re-measures it before anime's
    // first tick has adopted the new observer's target, which anime then refreshes itself
    if (driver) refreshObserver(driver.observer);
    paint();
    if (run.offsetHeight !== before) emit(LAYOUT_EVENT);
  };
  const soon = () => {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(() => relayout());
  };

  // A resize keeps a reader inside the running run the same fraction through it (the owner, 2026-09-29), judged from
  // where they last read it: by the time anything hears of a resize, the page has laid the new window out, and the pieces
  // above move the reader by their own changes (the live drawing's pin, on "resize"; 02's guard, from its observer). The
  // run keeps its reader's place, its box and the window they read it in while its pin is the size it last laid out
  // (steady), as 02's guard keeps its own, and answers a resize from its pin's observer: made after 02's guard's (that
  // one lives for the journey, started before any module), it runs after it in the same frame, so the run's move is the
  // last word for its reader, where a relayout in the frame's animation callbacks, before the observers, was undone by
  // 02's move for a reader past it.
  let read: ReadPlace | null = null;
  const steady = () => at !== null && pin.clientWidth === at.w && pin.clientHeight === at.h;
  const learn = () => {
    if (!steady()) return;
    const r = run.getBoundingClientRect();
    read = { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, y: window.scrollY, vh: window.innerHeight };
  };
  const onPin = () => {
    if (!at || steady() || !read) return; // not running, its first delivery, or nothing to judge from
    cancelAnimationFrame(layoutFrame);
    relayout(read);
  };
  const pinObserver = new ResizeObserver(onPin);
  pinObserver.observe(pin);
  const onResize = () => {
    if (!at) soon(); // unpinned, a window that grew may fit now; pinned, the pin's observer answers
  };

  // Tab onto a link in a card: bring its station to the window (the page's own scroll-behavior glides it). Only the
  // keyboard's focus (a Tab in this task, and :focus-visible): a mouse's needs no glide, and focus returning to the window
  // must not pull a reader who scrolled away back to it (Task 6 review, round 2).
  const tab = watchTab();
  let again = 0;
  const onFocus = (event: FocusEvent) => {
    const layout = at;
    const el = event.target instanceof Element ? event.target : null;
    const station = el?.closest<HTMLElement>("[data-station]") ?? null;
    const i = station ? stations.indexOf(station) : -1;
    if (!el || i < 0 || !tab.down() || !keyboardFocus(el)) return;
    if (!layout) {
      // Not pinned (a reader below the run Shift+Tabs up into it): the browser glides to the card as to any link, and
      // the glide may bring the run's top into the window, pinning it at its start with the card clipped far to the
      // right. decide() aims its station then, while this watch still holds the glide (final review, I1).
      aimed = i;
      watch.arm();
      return;
    }
    const from = window.scrollY;
    const top = stationY(i, layout);
    if (Math.abs(top - from) < 1) return; // at the window already: no glide to watch
    aimed = i;
    window.scrollTo({ top });
    watch.arm();
    // Safari reveals the link with a glide of its own, begun after this listener, which replaces this one (Option-Tab
    // brought the station to rest 160px short): aimed again in the next task, while focus is still in the station and
    // the watch still holds the glide (the reader's own scroll or a press of the pointer lets go of both), and only
    // while the page still stands between where the Tab found it and the station. A drag of the scrollbar lets go of
    // nothing, and on a busy page it can land before this task: a reader it took out of that span has moved on (final
    // review, I2).
    window.clearTimeout(again);
    again = window.setTimeout(() => {
      const now = at;
      if (!now || aimed !== i || !watch.armed() || !station?.contains(document.activeElement)) return;
      const to = stationY(i, now);
      if (between(window.scrollY, from, to)) window.scrollTo({ top: to });
    }, 0);
  };
  /** Once the run pins under a Tab's glide begun while it was not pinned: that station to the window, while the watch
   * still holds the glide and focus is still in the station (I1). */
  function aim(): void {
    const layout = at;
    const station = stations[aimed];
    if (!layout || !station || !watch.armed() || !station.contains(document.activeElement)) return;
    const top = stationY(aimed, layout);
    if (Math.abs(top - window.scrollY) >= 1) window.scrollTo({ top });
  }
  /** The glide cut short by a place-keeping jump (the drawing falling to the still under load; WCAG 2.4.11): its station
   * back to the window while focus is still in it, after each cut, at most three times (focus-glide.ts's watch says
   * when). `aimed` stays: onFocus and a relayout reset it. */
  const watch = watchGlide(() => {
    const layout = at;
    const i = aimed;
    const station = stations[i];
    if (layout && station?.contains(document.activeElement)) window.scrollTo({ top: stationY(i, layout) });
  });
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
  window.addEventListener(LAYOUT_EVENT, learn); // after a piece above moved the reader by its own change
  window.addEventListener("scroll", learn, { passive: true });
  window.addEventListener("resize", onResize);
  trackEl.addEventListener("focusin", onFocus);
  document.addEventListener("click", onClick);
  return () => {
    cancelAnimationFrame(placeFrame);
    cancelAnimationFrame(layoutFrame);
    wait(false);
    window.removeEventListener(LAYOUT_EVENT, soon);
    window.removeEventListener(LAYOUT_EVENT, learn);
    window.removeEventListener("scroll", learn);
    window.removeEventListener("resize", onResize);
    pinObserver.disconnect();
    trackEl.removeEventListener("focusin", onFocus);
    document.removeEventListener("click", onClick);
    window.clearTimeout(again);
    tab.stop();
    watch.stop();
    if (!at) return;
    unpin();
    emit(LAYOUT_EVENT);
  };
}
