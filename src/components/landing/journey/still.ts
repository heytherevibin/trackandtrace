import { DRAWING_EVENT, LAYOUT_EVENT, emit } from "./journey-events";
import { columnsFit, columnsZone, distribute, leaderFrom, letterbox, type Box } from "./labels-layout";
import type { JourneyContext, Teardown } from "./start-journey";
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

export function startStill(_ctx: JourneyContext): Teardown {
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
    for (const { line, dot } of leaders) {
      line.remove();
      dot.remove();
    }
    leaders = [];
  };

  const drawLeaders = (zone: Box, pinBox: DOMRect) => {
    const fit = letterbox(WIDE.viewBox, { x: zone.l, y: zone.t, width: zone.r - zone.l, height: zone.b - zone.t });
    // every label's box read before any leader is written, so no write forces a layout
    const boxes = labels.map((el) => ({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth }));
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
    for (const compact of [false, true]) {
      pin.classList.toggle("is-compact", compact);
      const l = distribute(left.map((el) => el.offsetHeight), rel(copy).bottom + 22, pinBox.height - 44);
      const r = distribute(right.map((el) => el.offsetHeight), Math.max(20, pinBox.height * 0.05), rel(titleBlock).top - 14);
      left.forEach((el, i) => {
        el.style.top = `${l.tops[i]}px`;
      });
      right.forEach((el, i) => {
        el.style.top = `${r.tops[i]}px`;
      });
      if (l.fits && r.fits) {
        fits = true;
        break;
      }
    }
    const zone = columnsZone({ leftEdges: left.map((el) => rel(el).right), rightEdges: right.map((el) => rel(el).left), top: rel(copy).bottom + 16, floor: rel(titleBlock).top - 16 });
    if (!columnsFit({ fits, zone, pinWidth: pinBox.width, titleWidth: titleBlock.offsetWidth })) return false;
    holder.style.left = `${Math.round(zone.l)}px`;
    holder.style.top = `${Math.round(zone.t)}px`;
    holder.style.width = `${Math.round(zone.r - zone.l)}px`;
    holder.style.height = `${Math.round(zone.b - zone.t)}px`;
    drawLeaders(zone, pinBox);
    return true;
  };

  // A reader already below the chapter never asked to move: the pin taking its columns for the first time,
  // or giving them up, must shift such a reader by exactly the height that gained or lost, never snap them
  // to its start. Scoped to that one transition only (never a plain resize that leaves is-columns as it
  // was, columns or not): #how keeps its own reader in place independently (chapters.ts), and the two must
  // never both react to the same resize — each computing its own correction from its own idea of "before"
  // can overwrite the other's. A flip is measured fresh, before and after, within this one call.
  const keepBelow = (change: () => void): boolean => {
    const wasColumns = pin.classList.contains("is-columns");
    const beforeRect = pin.getBoundingClientRect();
    const beforeScrollY = window.scrollY;
    const beforeDocBottom = beforeRect.top + beforeScrollY + beforeRect.height;
    change();
    const isColumns = pin.classList.contains("is-columns");
    if (wasColumns === isColumns) return isColumns;
    const afterHeight = pin.getBoundingClientRect().height;
    if (beforeScrollY >= beforeDocBottom && afterHeight !== beforeRect.height) {
      window.scrollTo({ top: beforeScrollY + (afterHeight - beforeRect.height), behavior: "instant" });
    }
    return isColumns;
  };

  // While the pin stays in columns across two calls (never a flip: that is keepBelow's job above), only its
  // own height formula answering a plain window resize can still move a reader below it — #how never enters
  // into that, since nothing here ever changes its own size, so there is no other guard to conflict with.
  // Held across calls, like chapters.ts's own placeBox: a plain resize is never caught mid-change by any
  // callback, only after, so there is no "before" left to measure at that moment except what was on record.
  let colBottom: number | null = null;
  let colScrollY = 0;
  const onScroll = () => {
    colScrollY = window.scrollY;
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  const layout = () => {
    frame = 0;
    const wasColumns = pin.classList.contains("is-columns");
    const before = colBottom;
    const beforeY = colScrollY;
    const isColumns = keepBelow(() => {
      if (!settle()) clear();
    });
    if (wasColumns && isColumns && before !== null) {
      const rect = pin.getBoundingClientRect();
      const now = rect.top + window.scrollY + rect.height;
      if (beforeY >= before && now !== before) window.scrollTo({ top: beforeY + (now - before), behavior: "instant" });
    }
    if (isColumns) {
      const rect = pin.getBoundingClientRect();
      colBottom = rect.top + window.scrollY + rect.height;
      colScrollY = window.scrollY;
    } else {
      colBottom = null;
    }
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
  const observer = new ResizeObserver(schedule);
  observer.observe(pin);
  void document.fonts.ready.then(schedule);
  schedule();

  return () => {
    alive = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    window.removeEventListener(DRAWING_EVENT, schedule);
    window.removeEventListener(LAYOUT_EVENT, schedule);
    columns.removeEventListener("change", schedule);
    window.removeEventListener("scroll", onScroll);
    observer.disconnect();
    for (const stop of pointing) stop();
    light(null);
    clear();
  };
}
