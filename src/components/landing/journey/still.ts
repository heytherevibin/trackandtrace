import { pastShift } from "./drawing-mode";
import { DRAWING_EVENT, LAYOUT_EVENT, emit, type DrawingDetail } from "./journey-events";
import { columnsFit, columnsZone, distribute, leaderFrom, letterbox } from "./labels-layout";
import type { JourneyContext, Teardown } from "./start-journey";
import { STILL_MANIFEST } from "./still-manifest";
import { isPartId, partSide } from "./train-parts";

// The drawn train's labels while the page draws still (spec §3.C; prototype v3's labels.js and still.js; J4-7).
// On wide screens they stand in two columns beside the drawing, each with a leader to its part, when they fit;
// otherwise the page's own parts list stands. A fine pointer resting on a label lights its part. Labels never fade
// (text moves by transform only). When the drawing goes live, the live drawing (J5) takes the labels over, and this
// module stands aside.

const NS = "http://www.w3.org/2000/svg";
const WIDE = STILL_MANIFEST.shapes.anatomyWide;
const COLUMNS_QUERY = "(min-width: 64rem)";
const HOLDER = ["left", "top", "width", "height"] as const;

interface Leader {
  readonly line: SVGLineElement;
  readonly dot: SVGCircleElement;
}
interface RoundedBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// The pin's own height (and whether it settled into columns) the reader last actually saw, kept on
// JourneyContext's `still` (start-journey.ts) for this startJourney's whole lifetime, across every rebuild: a
// teardown's clear() drops .is-columns synchronously, before the reader has seen anything change, and the
// very next frame's fresh startStill() instance settles again — comparing that fresh instance's first pass
// against what clear() just (invisibly) left behind would read the rebuild itself as a change the reader
// lived through, and move them for a jump they never saw. Comparing against what was last actually settled,
// instead, only reacts to changes the reader really saw. A value kept on the context, rather than at module
// scope, also means a fresh client navigation back to the page (a new startJourney) starts with nothing on
// record: the module chunk itself stays loaded across that navigation, but its own last-seen place must not.
// null height: nothing has settled yet this lifetime, so the very first settle (whatever height it lands on)
// is never treated as a change from anything.

export function startStill({ still }: JourneyContext): Teardown {
  const pin = document.querySelector<HTMLElement>("#anatomy .anatomy-pin");
  const copy = pin?.querySelector<HTMLElement>(".anatomy-copy");
  const holder = pin?.querySelector<HTMLElement>(".anatomy-still:not(.is-noscript)");
  const lines = pin?.querySelector<SVGSVGElement>("svg.callout-lines");
  const titleBlock = pin?.querySelector<HTMLElement>(".title-block");
  if (!pin || !copy || !holder || !lines || !titleBlock) return () => {};
  const labels = [...pin.querySelectorAll<HTMLElement>(".callout")];
  const left = labels.filter((l) => l.dataset.side === "left");
  const right = labels.filter((l) => l.dataset.side === "right");
  const columns = window.matchMedia(COLUMNS_QUERY);
  const fine = window.matchMedia("(pointer: fine)");
  let leaders: Leader[] = [];
  let frame = 0;
  let alive = true;
  // Whether the labels are the live drawing's (standAside, below). A build that starts while the drawing is already
  // live (a rebuild) finds them so.
  let aside = document.documentElement.dataset.drawing === "live";
  // The reader's scroll while the pin was last the height on record (below), learned only then: a scroll once it has
  // changed is someone answering that change (02's guard, scroll anchoring, a clamp), never the reader.
  let seenY = window.scrollY;
  const learn = () => {
    const height = still.get().height;
    if (height === null || pin.getBoundingClientRect().height === height) seenY = window.scrollY;
  };

  const clear = () => {
    pin.classList.remove("is-columns", "is-compact");
    for (const label of labels) label.style.top = "";
    for (const key of HOLDER) holder.style[key] = "";
    lines.removeAttribute("viewBox");
    for (const { line, dot } of leaders) {
      line.remove();
      dot.remove();
    }
    leaders = [];
  };

  const drawLeaders = (box: RoundedBox, pinBox: DOMRect, tops: ReadonlyMap<HTMLElement, number>) => {
    const fit = letterbox(WIDE.viewBox, box);
    // left and width still come from the DOM (CSS decides them, never written here); top is what settle()
    // just decided for each label (the tops map), so drawing the leaders never needs to read that write back
    // off the DOM.
    const boxes = labels.map((el) => ({ left: el.offsetLeft, top: tops.get(el) ?? el.offsetTop, width: el.offsetWidth }));
    lines.setAttribute("viewBox", `0 0 ${pinBox.width} ${pinBox.height}`);
    if (leaders.length === 0) {
      leaders = labels.map(() => {
        const line = document.createElementNS(NS, "line");
        const dot = document.createElementNS(NS, "circle");
        dot.setAttribute("r", "3.5");
        lines.append(line, dot);
        return { line, dot };
      });
    }
    labels.forEach((label, i) => {
      const part = label.dataset.part ?? "";
      const at = isPartId(part) ? WIDE.anchors[part] : undefined;
      if (!at) return;
      const anchor = { x: fit.x + at[0] * fit.scale, y: fit.y + at[1] * fit.scale };
      const seg = leaderFrom(boxes[i], partSide(part), anchor);
      const { line, dot } = leaders[i];
      line.setAttribute("x1", seg.x1.toFixed(1));
      line.setAttribute("y1", seg.y1.toFixed(1));
      line.setAttribute("x2", seg.x2.toFixed(1));
      line.setAttribute("y2", seg.y2.toFixed(1));
      dot.setAttribute("cx", anchor.x.toFixed(1));
      dot.setAttribute("cy", anchor.y.toFixed(1));
    });
  };

  const settle = (): boolean => {
    if (document.documentElement.dataset.drawing !== "still" || !columns.matches) return false;
    pin.classList.add("is-columns");
    const pinBox = pin.getBoundingClientRect();
    const rel = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - pinBox.top, bottom: r.bottom - pinBox.top, left: r.left - pinBox.left, right: r.right - pinBox.left };
    };
    let fits = false;
    const tops = new Map<HTMLElement, number>();
    for (const compact of [false, true]) {
      pin.classList.toggle("is-compact", compact);
      const l = distribute(left.map((el) => el.offsetHeight), rel(copy).bottom + 22, pinBox.height - 44);
      const r = distribute(right.map((el) => el.offsetHeight), Math.max(20, pinBox.height * 0.05), rel(titleBlock).top - 14);
      left.forEach((el, i) => {
        el.style.top = `${l.tops[i]}px`;
        tops.set(el, l.tops[i]);
      });
      right.forEach((el, i) => {
        el.style.top = `${r.tops[i]}px`;
        tops.set(el, r.tops[i]);
      });
      if (l.fits && r.fits) {
        fits = true;
        break;
      }
    }
    const zone = columnsZone({ leftEdges: left.map((el) => rel(el).right), rightEdges: right.map((el) => rel(el).left), top: rel(copy).bottom + 16, floor: rel(titleBlock).top - 16 });
    if (!columnsFit({ fits, zone, pinWidth: pinBox.width, titleWidth: titleBlock.offsetWidth })) return false;
    // Rounded once, so the leaders' letterbox lands in the exact box the holder is placed at — never a
    // fractional pixel apart from it.
    const box: RoundedBox = { x: Math.round(zone.l), y: Math.round(zone.t), width: Math.round(zone.r - zone.l), height: Math.round(zone.b - zone.t) };
    holder.style.left = `${box.x}px`;
    holder.style.top = `${box.y}px`;
    holder.style.width = `${box.width}px`;
    holder.style.height = `${box.height}px`;
    drawLeaders(box, pinBox, tops);
    return true;
  };

  // A reader past the chapter (readerPlace's past: its foot within the window's top half) never asked to move:
  // the pin taking its columns for the first time, giving them up, or its own height formula answering a plain
  // resize while staying in columns, must shift such a reader by exactly the height that gained or lost, never
  // snap them to its start. Never reacts while list on both sides of the change, though (never a plain resize
  // to the ordinary, content-driven list height, which nothing here writes or is answerable for): #how keeps
  // its own reader in place independently in that case, via chapters.ts, and the two must never both react to
  // the same resize.
  // Compared against what the reader last actually settled on (ctx.still, above) when there is one, never a
  // value measured fresh in this same call: a rebuild's teardown already having run, or the columns formula
  // answering a resize, is never caught mid-change by any callback, only after, so there is no "before" left
  // to measure at that moment except what was already on record (prototype v3's placeBox pattern, chapters.ts's
  // own settlePlace) — comparing a fresh instance's first pass against a live read instead would misread the
  // rebuild itself (list, briefly, while nothing is watching, then columns again) as a flip the reader lived
  // through. Only the very first settle this lifetime, with nothing on record yet, measures fresh: at that
  // moment the pin still carries its untouched server-rendered height, which a live read is the right (and
  // only) way to learn.
  const layout = () => {
    frame = 0;
    if (document.documentElement.dataset.drawing !== "still") return standAside();
    const place = still.get();
    const wasColumns = place.columns;
    const beforeRect = pin.getBoundingClientRect();
    const beforeHeight = place.height ?? beforeRect.height;
    const beforeScrollY = window.scrollY;

    const isColumns = settle();
    if (!isColumns) clear();
    const afterHeight = pin.getBoundingClientRect().height;

    if (wasColumns || isColumns) {
      // The change to answer: this pass's own, from the height on record, unless the reader was already moved since it
      // changed (a resize 02's guard answered, its move covering everything above #how's foot): then this pass's own only.
      const from = beforeScrollY === seenY ? beforeHeight : beforeRect.height;
      // Past the pin by the rule every piece uses (J6-4): its foot within the window's top half. The window's top edge
      // alone missed a reader at #principles, the pin's foot a few px under the masthead, and moved them 77 px.
      const shift = pastShift({ top: beforeRect.top, bottom: beforeRect.top + from }, afterHeight - from, window.innerHeight);
      if (shift !== 0) window.scrollTo({ top: beforeScrollY + shift, behavior: "instant" });
    }
    still.set({ columns: isColumns, height: afterHeight });
    seenY = window.scrollY;
    // the chapter changed height: every module that measures sections hears it (only on a change, or it would loop)
    if (wasColumns !== isColumns) emit(LAYOUT_EVENT);
  };

  const schedule = () => {
    if (alive && !frame) frame = requestAnimationFrame(layout);
  };

  // The drawing going live takes the labels over (live-labels.ts, J5-5): let go of them at once, in the same task the
  // switch happens, so no frame of the still's columns ever shows under the pinned chapter. What was settled for the
  // still is forgotten; the next still settle measures afresh. The labels are handed over clean once, at the switch:
  // from then until the drawing is still again, .is-hot is the live drawing's alone, whatever re-runs layout().
  const standAside = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!aside) light(null);
    aside = true;
    clear();
    still.set({ columns: false, height: null });
  };
  const onDrawing = (event: Event) => {
    if ((event as CustomEvent<DrawingDetail>).detail.mode === "live") return standAside();
    aside = false;
    schedule();
  };

  const light = (id: string | null) => {
    for (const g of holder.querySelectorAll<SVGGElement>("g[data-part]")) g.toggleAttribute("data-hot", g.dataset.part === id);
    for (const label of labels) label.classList.toggle("is-hot", label.dataset.part === id);
  };
  const pointing = labels.map((label) => {
    // Only while the still draws, so .is-hot has one writer at a time (the live drawing's while live).
    const enter = () => {
      if (fine.matches && document.documentElement.dataset.drawing === "still") light(label.dataset.part ?? null);
    };
    const leave = () => {
      if (document.documentElement.dataset.drawing === "still") light(null);
    };
    label.addEventListener("pointerenter", enter);
    label.addEventListener("pointerleave", leave);
    return () => {
      label.removeEventListener("pointerenter", enter);
      label.removeEventListener("pointerleave", leave);
    };
  });

  window.addEventListener(DRAWING_EVENT, onDrawing);
  window.addEventListener(LAYOUT_EVENT, schedule);
  window.addEventListener("scroll", learn, { passive: true });
  columns.addEventListener("change", schedule);
  // The pin's own box (fixed by CSS in columns mode) never answers a label, the title block or the copy
  // changing size — a font swapping in after the first pass, say — so each is watched too. layout() itself
  // toggles .is-compact, which changes a label's own height (its detail line disappears, journey-island.css),
  // so this observer does fire again from layout()'s own write; that second pass settles on the same
  // compact-or-not choice, so layout() converges on it rather than looping.
  const observer = new ResizeObserver(schedule);
  observer.observe(pin);
  observer.observe(copy);
  observer.observe(titleBlock);
  for (const label of labels) observer.observe(label);
  void document.fonts.ready.then(schedule);
  schedule();

  return () => {
    alive = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    window.removeEventListener(DRAWING_EVENT, onDrawing);
    window.removeEventListener(LAYOUT_EVENT, schedule);
    window.removeEventListener("scroll", learn);
    columns.removeEventListener("change", schedule);
    observer.disconnect();
    for (const stop of pointing) stop();
    if (!aside) light(null);
    clear();
  };
}
