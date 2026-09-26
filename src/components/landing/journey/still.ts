import { DRAWING_EVENT, LAYOUT_EVENT, emit } from "./journey-events";
import { columnsFit, columnsZone, distribute, leaderFrom, letterbox } from "./labels-layout";
import type { Teardown } from "./start-journey";
import { STILL_MANIFEST } from "./still-manifest";
import { isPartId, partSide } from "./train-parts";

// The drawn train's labels while the page draws still (spec §3.C; prototype v3's labels.js and still.js; J4-7).
// On wide screens they stand in two columns beside the drawing, each with a leader to its part, when they fit;
// otherwise the page's own parts list stands. A fine pointer resting on a label lights its part. Labels never fade
// (text moves by transform only); the live drawing adds their scroll-tied reveal in J5.

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

// The pin's own height (and whether it settled into columns) the reader last actually saw, kept across every
// rebuild for the journey's whole page load (module-level, exactly like chapters.ts's own placeBox): a
// teardown's clear() drops .is-columns synchronously, before the reader has seen anything change, and the
// very next frame's fresh startStill() instance settles again — comparing that fresh instance's first pass
// against what clear() just (invisibly) left behind would read the rebuild itself as a change the reader
// lived through, and move them for a jump they never saw. Comparing against what was last actually settled,
// instead, only reacts to changes the reader really saw. null: nothing has settled yet this page load, so
// the very first settle (whatever height it lands on) is never treated as a change from anything.
let lastColumns = false;
let lastHeight: number | null = null;

export function startStill(): Teardown {
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
    // just decided for each label, never read back off the DOM — offsetTop can still answer the write from
    // a call before this one, its own layout a frame behind the style it was just given.
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

  // A reader already below the chapter never asked to move: the pin taking its columns for the first time,
  // giving them up, or its own height formula answering a plain resize while staying in columns, must shift
  // such a reader by exactly the height that gained or lost, never snap them to its start. Never reacts while
  // list on both sides of the change, though (never a plain resize to the ordinary, content-driven list
  // height, which nothing here writes or is answerable for): #how keeps its own reader in place
  // independently in that case, via chapters.ts, and the two must never both react to the same resize.
  // Compared against what the reader last actually settled on (lastColumns/lastHeight above) when there is
  // one, never a value measured fresh in this same call: a rebuild's teardown already having run, or the
  // columns formula answering a resize, is never caught mid-change by any callback, only after, so there is
  // no "before" left to measure at that moment except what was already on record (prototype v3's placeBox
  // pattern, chapters.ts's own settlePlace) — comparing a fresh instance's first pass against a live read
  // instead would misread the rebuild itself (list, briefly, while nothing is watching, then columns again)
  // as a flip the reader lived through. Only the very first settle this page load, with nothing on record
  // yet, measures fresh: at that moment the pin still carries its untouched server-rendered height, which a
  // live read is the right (and only) way to learn.
  const layout = () => {
    frame = 0;
    const wasColumns = lastColumns;
    const beforeRect = pin.getBoundingClientRect();
    const beforeHeight = lastHeight ?? beforeRect.height;
    const beforeScrollY = window.scrollY;

    const isColumns = settle();
    if (!isColumns) clear();
    const afterHeight = pin.getBoundingClientRect().height;

    if (wasColumns || isColumns) {
      const beforeDocBottom = beforeRect.top + beforeScrollY + beforeHeight;
      if (beforeScrollY >= beforeDocBottom && afterHeight !== beforeHeight) window.scrollTo({ top: beforeScrollY + (afterHeight - beforeHeight), behavior: "instant" });
    }
    lastColumns = isColumns;
    lastHeight = afterHeight;
    // the chapter changed height: every module that measures sections hears it (only on a change, or it would loop)
    if (wasColumns !== isColumns) emit(LAYOUT_EVENT);
  };

  const schedule = () => {
    if (alive && !frame) frame = requestAnimationFrame(layout);
  };

  const light = (id: string | null) => {
    for (const g of holder.querySelectorAll<SVGGElement>("g[data-part]")) g.toggleAttribute("data-hot", g.dataset.part === id);
    for (const label of labels) label.classList.toggle("is-hot", label.dataset.part === id);
  };
  const pointing = labels.map((label) => {
    const enter = () => {
      if (fine.matches) light(label.dataset.part ?? null);
    };
    const leave = () => light(null);
    label.addEventListener("pointerenter", enter);
    label.addEventListener("pointerleave", leave);
    return () => {
      label.removeEventListener("pointerenter", enter);
      label.removeEventListener("pointerleave", leave);
    };
  });

  window.addEventListener(DRAWING_EVENT, schedule);
  window.addEventListener(LAYOUT_EVENT, schedule);
  columns.addEventListener("change", schedule);
  // The pin's own box (fixed by CSS in columns mode) never answers a label, the title block or the copy
  // changing size — a font swapping in after the first pass, say — so each is watched too. layout() only
  // ever writes labels' own `top` and the holder's geometry, never anything these boxes are measured from
  // (a label's height, the title block's or the copy's box), so observing them can never loop back into
  // triggering itself.
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
    window.removeEventListener(DRAWING_EVENT, schedule);
    window.removeEventListener(LAYOUT_EVENT, schedule);
    columns.removeEventListener("change", schedule);
    observer.disconnect();
    for (const stop of pointing) stop();
    light(null);
    clear();
  };
}
