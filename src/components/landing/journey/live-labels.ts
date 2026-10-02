import { columnsFit, columnsZone, distribute, leaderFrom, type Box } from "./labels-layout";
import { clamp } from "./scene/math";
import { isPartId, partSide, type PartId } from "./train-parts";

// The drawn train's labels while the drawing is live (spec §3.A; prototype v3's labels.js, under J5-5): two columns
// beside the drawing on wide screens, or the page's parts list when the columns cannot fit, and below 64rem. Each
// label rises and wipes in by transform and clip-path, never opacity or visibility: they are the page's real list.
// Their leaders are drawn in their own svg. Everything is laid out from measured boxes, never fixed spots. No three
// here (scene/math.ts has none).

const NS = "http://www.w3.org/2000/svg";
const NARROW = "(max-width: 63.99rem)";

/** Label i's reveal (v3): the callouts phase ×1.8, each fifth a step later, so each column fills from the top. */
export function revealOf(i: number, callouts: number): number {
  return clamp(callouts * 1.8 - (i % 5) * 0.12);
}

/** A left-to-right wipe for words that must never fade: all of it clipped at 0, none at 1. */
export function wipe(t: number): string {
  const k = clamp(t);
  return k >= 1 ? "" : `inset(0 ${((1 - k) * 100).toFixed(1)}% 0 0)`;
}

export interface LiveLabels {
  readonly pin: HTMLElement;
  readonly labels: readonly HTMLElement[];
  /** Lays the labels out; the zone the drawing keeps to (pin-relative px), or null when even the list leaves it no room. */
  layout(): Box | null;
  listMode(): boolean;
  /** The list stands beside the drawing (a phone on its side). */
  beside(): boolean;
  /** Places each label at its reveal (0–1) and its leader toward its part's viewport point. */
  draw(anchorOf: (part: PartId) => { readonly x: number; readonly y: number } | null, reveal: (i: number) => number): void;
  clear(): void;
}

/** The chapter's words' height in the list layout: the pin sticks that far above the masthead's foot (CSS), so they
 * scroll away under it first. */
const copyHeight = (copy: HTMLElement): number => Math.round(copy.offsetTop + copy.offsetHeight);

/**
 * Where the live pin takes hold, below the window's top, for the page as it is laid out now: its sticky top, where its
 * scroll timeline starts (scene/live.ts's enterAt). In the list layout that is the words' height above the masthead's
 * foot, which moves with the window (their top padding is in vh) but is written only when the labels are laid out
 * again, after a resize's other answers have run: measured here afresh, as layout() will write it.
 */
export function pinTop(pin: HTMLElement): number {
  const top = Math.round(Number.parseFloat(getComputedStyle(pin).top)) || 0;
  const copy = pin.querySelector<HTMLElement>(".anatomy-copy");
  const written = pin.style.getPropertyValue("--anatomy-copy-h");
  if (pin.dataset.live !== "list" || !copy || written === "") return top;
  return top + Math.round(Number.parseFloat(written)) - copyHeight(copy);
}

/** How the live drawing lays its labels out again (scene/live.ts's relayout), by its pin, while it runs. */
const relays = new WeakMap<HTMLElement, () => void>();

/** The live drawing's own relayout for `pin`, kept while it runs: returns what forgets it. */
export function relayWith(pin: HTMLElement, relayout: () => void): () => void {
  relays.set(pin, relayout);
  return () => {
    if (relays.get(pin) === relayout) relays.delete(pin);
  };
}

/**
 * Where the live pin takes hold once its labels are laid out for the window as it is now: asked for as a resize is
 * answered, before the scene's own relayout has had its turn. The labels choose their layout by the window (columns from
 * 64rem while they fit, else the list), and the pin's sticky top follows that choice: a tablet turned flips it, 202 px
 * from under the masthead to the words' height above it, and read before the flip it left a reader inside the chapter
 * up to 0.047 of its range off (found 2026-10-02). The scene lays them out again here, as it would a moment later.
 */
export function pinTopLaidOut(pin: HTMLElement): number {
  relays.get(pin)?.();
  return pinTop(pin);
}

export function createLiveLabels(section: HTMLElement): LiveLabels | null {
  const pin = section.querySelector<HTMLElement>(".anatomy-pin");
  const copy = pin?.querySelector<HTMLElement>(".anatomy-copy");
  const caption = pin?.querySelector<HTMLElement>(".anatomy-caption");
  const titleBlock = pin?.querySelector<HTMLElement>(".title-block");
  const legend = pin?.querySelector<HTMLElement>(".anatomy-legend");
  if (!pin || !copy || !caption || !titleBlock || !legend) return null;
  const labels = [...pin.querySelectorAll<HTMLElement>(".callout")];
  const left = labels.filter((l) => l.dataset.side === "left");
  const right = labels.filter((l) => l.dataset.side === "right");
  // Asked afresh at each layout: WebKit leaves a query made earlier at its old answer through the "resize" that changed
  // it (until its own change is told), and the labels laid out from it then took the list a 1024 window had outgrown.
  const narrow = (): boolean => window.matchMedia(NARROW).matches;
  const lines = document.createElementNS(NS, "svg");
  lines.classList.add("live-lines");
  lines.setAttribute("aria-hidden", "true");
  lines.setAttribute("focusable", "false");
  const leaders = labels.map(() => {
    const line = document.createElementNS(NS, "line");
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", "3.5");
    lines.append(line, dot);
    return { line, dot };
  });
  pin.append(lines);
  let tops = new Map<HTMLElement, number>();
  let beside = false;

  const rel = (el: Element, pr: DOMRect) => {
    const r = el.getBoundingClientRect();
    return { top: r.top - pr.top, bottom: r.bottom - pr.top };
  };
  const resetLabels = () => {
    for (const l of labels) {
      l.style.removeProperty("transform");
      l.style.removeProperty("clip-path");
    }
  };

  const columns = (): Box | null => {
    pin.dataset.live = "columns";
    let fits = false;
    let placed = new Map<HTMLElement, number>();
    for (const compact of [false, true]) {
      pin.toggleAttribute("data-compact", compact);
      const pr = pin.getBoundingClientRect();
      const l = distribute(left.map((el) => el.offsetHeight), rel(copy, pr).bottom + 22, rel(caption, pr).top - 14);
      const r = distribute(right.map((el) => el.offsetHeight), Math.max(20, pr.height * 0.05), rel(titleBlock, pr).top - 14);
      placed = new Map([...left.map((el, i) => [el, l.tops[i] ?? 0] as const), ...right.map((el, i) => [el, r.tops[i] ?? 0] as const)]);
      if (l.fits && r.fits) {
        fits = true;
        break;
      }
    }
    const pr = pin.getBoundingClientRect();
    const zone = columnsZone({
      leftEdges: left.map((el) => el.offsetLeft + el.offsetWidth),
      rightEdges: right.map((el) => el.offsetLeft),
      top: rel(copy, pr).bottom + 16,
      floor: Math.min(rel(caption, pr).top, rel(titleBlock, pr).top) - 16,
    });
    if (!columnsFit({ fits, zone, pinWidth: pr.width, titleWidth: titleBlock.offsetWidth })) return null;
    tops = placed;
    return zone;
  };

  /** The list's zone for the drawing, or null when the list itself runs past its own box (text made larger than the
   * window holds, such as 200%): its parts would cover the chapter's words and the section below, so the drawing does
   * not fit, and the chapter reads as the still, in the page's own flow (§3.C). */
  const list = (): Box | null => {
    pin.dataset.live = "list";
    pin.removeAttribute("data-compact");
    tops = new Map();
    resetLabels();
    // the words scroll away under the masthead first; then the drawing and its list hold the window (CSS)
    pin.style.setProperty("--anatomy-copy-h", `${copyHeight(copy)}px`);
    const pr = pin.getBoundingClientRect();
    const t = rel(copy, pr).bottom + 16;
    const lr = legend.getBoundingClientRect();
    if (legend.scrollHeight > legend.clientHeight + 1) return null;
    beside = lr.left > pr.left + pr.width * 0.45;
    if (beside) return { l: 8 - pr.left, r: lr.left - 12 - pr.left, t, b: pr.height - 12 };
    return { l: 8 - pr.left, r: window.innerWidth - 8 - pr.left, t, b: lr.top - pr.top - 12 };
  };

  return {
    pin,
    labels,
    layout() {
      beside = false;
      // the labels' boxes are reset, so they stand unplaced until a frame draws them: wiped till then (journey-island.css)
      pin.removeAttribute("data-drawn");
      pin.style.removeProperty("--anatomy-copy-h");
      const zone = (!narrow() ? columns() : null) ?? list();
      return zone && zone.b - zone.t >= 150 && zone.r - zone.l >= 200 ? zone : null;
    },
    listMode: () => pin.dataset.live !== "columns",
    beside: () => beside,
    draw(anchorOf, reveal) {
      const pr = pin.getBoundingClientRect();
      lines.setAttribute("viewBox", `0 0 ${pr.width.toFixed(1)} ${pr.height.toFixed(1)}`);
      const inColumns = pin.dataset.live === "columns";
      // every box read before anything is written, so no write forces a layout
      const boxes = labels.map((l) => ({ left: l.offsetLeft, width: l.offsetWidth }));
      labels.forEach((label, i) => {
        const leader = leaders[i];
        const part = label.dataset.part ?? "";
        if (!leader) return;
        const hide = () => {
          leader.line.style.opacity = "0";
          leader.dot.style.opacity = "0";
        };
        if (!inColumns || !isPartId(part)) return hide();
        const t = clamp(reveal(i));
        const rise = (1 - t) * 8;
        const top = (tops.get(label) ?? 0) + rise;
        label.style.transform = `translateY(${top.toFixed(2)}px)`;
        label.style.clipPath = wipe(t);
        const at = anchorOf(part);
        if (!at) return hide();
        const seg = leaderFrom({ left: boxes[i]?.left ?? 0, top, width: boxes[i]?.width ?? 0 }, partSide(part), { x: at.x - pr.left, y: at.y - pr.top });
        leader.line.setAttribute("x1", seg.x1.toFixed(1));
        leader.line.setAttribute("y1", seg.y1.toFixed(1));
        leader.line.setAttribute("x2", (seg.x1 + (seg.x2 - seg.x1) * t).toFixed(1));
        leader.line.setAttribute("y2", (seg.y1 + (seg.y2 - seg.y1) * t).toFixed(1));
        leader.line.style.opacity = String(t);
        leader.dot.setAttribute("cx", seg.x2.toFixed(1));
        leader.dot.setAttribute("cy", seg.y2.toFixed(1));
        leader.dot.style.opacity = t > 0.95 ? "1" : "0";
      });
      pin.setAttribute("data-drawn", "");
    },
    clear() {
      lines.remove();
      delete pin.dataset.live;
      pin.removeAttribute("data-compact");
      pin.removeAttribute("data-drawn");
      pin.style.removeProperty("--anatomy-copy-h");
      resetLabels(); // .is-hot is scene/live.ts's: its teardown's setHot(null) clears it
    },
  };
}
