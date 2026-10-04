"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** The root's font size as drawn: 16px. Larger, a reader has made the text larger (the browser's text size, or a
 * text-only zoom); half a pixel of slack for a browser that rounds. */
const DRAWN_ROOT_PX = 16.5;

/** What the box's content needs, and the text size it was measured at. */
interface Need {
  readonly px: number;
  readonly rootPx: number;
}

const rootPx = (): number => Number.parseFloat(getComputedStyle(document.documentElement).fontSize);

/**
 * Whether the box's content has outgrown it, as the page stands.
 *
 * What the content needs is measured, never given: laid out as drawn (`stacked` false), it is how far the box's widest
 * child reaches from the box's inner left edge, which for a table that cannot wrap is the table's own least width.
 * Stacked, the content no longer says what it needed, so the last measure is kept and reckoned at the present text
 * size (every length across a table is in rem). A kept measure is never the last word on going back: content drawn as
 * drawn again is measured afresh before anything is painted. The worst a stale one does is keep the rows stacked
 * until the box next changes size.
 */
function judge(el: HTMLElement, stacked: boolean, need: { current: Need | null }): boolean {
  const root = rootPx();
  const left = el.getBoundingClientRect().left + el.clientLeft;
  if (!stacked) {
    const reach = Math.max(0, ...[...el.children].map((child) => child.getBoundingClientRect().right - left));
    need.current = { px: reach, rootPx: root };
  }
  const kept = need.current;
  if (!kept || !(kept.rootPx > 0) || !(root > 0)) return false;
  const needs = (kept.px * root) / kept.rootPx;
  // Past the window's side the page cuts it, and no reader can bring it back: at any text size.
  if (left + needs > document.documentElement.clientWidth) return true;
  // Inside the window, what is drawn at 100% stays exactly as drawn, an overhang included.
  return root > DRAWN_ROOT_PX && needs > el.clientWidth + 0.5;
}

/**
 * True while the box's content cannot be drawn as drawn: the moment a table that cannot wrap should stack its rows
 * instead. That is so
 * - at any text size, when the content would run past the window's side, where the page cuts it off;
 * - with the reader's text larger than drawn, whenever the content is wider than the box.
 * At the drawn text size, content that overhangs its box inside the window is left as drawn. For the landing, where a
 * size container (which would say most of this in CSS) is not allowed at the widths the journey runs (run.spec.ts;
 * #110), and where the measure is the content's own, not a breakpoint.
 *
 * Judged in two places. In a layout effect, when the box is first drawn and each time the answer changes, before the
 * paint: content that has outgrown its box is never painted as drawn, and going back to as drawn is checked against a
 * fresh measure before anyone sees it. And in a ResizeObserver, whenever the box changes size, which a change of text
 * size does to any box padded in rem.
 */
export function useOutgrown<T extends HTMLElement>(): readonly [RefObject<T | null>, boolean] {
  const box = useRef<T>(null);
  const [outgrown, setOutgrown] = useState(false);
  /** What the page shows now, for the observer: the state as last committed. */
  const shown = useRef(false);
  const need = useRef<Need | null>(null);

  useLayoutEffect(() => {
    shown.current = outgrown;
    const el = box.current;
    if (!el) return;
    const next = judge(el, outgrown, need);
    if (next !== outgrown) setOutgrown(next);
  }, [outgrown]);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setOutgrown(judge(el, shown.current, need)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [box, outgrown];
}
