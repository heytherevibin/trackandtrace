"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** What the box's content needs, and the text size it was measured at. */
interface Need {
  readonly px: number;
  readonly rootPx: number;
}

/** A layout unit of slack (a browser lays out in 64ths of a pixel): content exactly as wide as its box has not outgrown it. */
const SLACK_PX = 0.02;

const rootPx = (): number => Number.parseFloat(getComputedStyle(document.documentElement).fontSize);

/**
 * Whether the box's content has outgrown it, as the page stands: whether the content needs more width than the box has
 * inside its own border.
 *
 * What the content needs is measured, never given: laid out as drawn (`stacked` false), it is how far the box's widest
 * child reaches from the box's inner left edge, which for a table that cannot wrap is the table's own least width.
 * Stacked, the content no longer says what it needed, so the last measure is kept and reckoned at the present text
 * size (every length across a table is in rem). A kept measure is never the last word on going back: content drawn as
 * drawn again is measured afresh before anything is painted. The worst a stale one does is keep the rows stacked
 * until the box next changes size.
 *
 * Read from the boxes' own edges, in fractions of a pixel, never from `clientWidth`: that is a whole number, and a
 * table as wide as a 647.2px box is not wider than "647".
 */
function judge(el: HTMLElement, stacked: boolean, need: { current: Need | null }): boolean {
  const root = rootPx();
  const style = getComputedStyle(el);
  const box = el.getBoundingClientRect();
  const left = box.left + (Number.parseFloat(style.borderLeftWidth) || 0);
  const holds = box.right - (Number.parseFloat(style.borderRightWidth) || 0) - left;
  // a box that is not laid out (not displayed; the server's markup) holds nothing and has outgrown nothing
  if (!(holds > 0)) return false;
  if (!stacked) {
    const reach = Math.max(0, ...[...el.children].map((child) => child.getBoundingClientRect().right - left));
    need.current = { px: reach, rootPx: root };
  }
  const kept = need.current;
  if (!kept || !(kept.rootPx > 0) || !(root > 0)) return false;
  return (kept.px * root) / kept.rootPx > holds + SLACK_PX;
}

/**
 * True while the box's content is wider than the box: the moment a table that cannot wrap has outgrown its frame, and
 * should stack its rows instead. At any text size, the drawn one included (decided 2026-10-05, the owner): the table
 * shows only where its frame holds it. For the landing, where a size container (which would say the same in CSS, given
 * a number) is not allowed at the widths the journey runs (run.spec.ts; #110), and where the measure is the content's
 * own, not a breakpoint.
 *
 * Judged in two places. In a layout effect, when the box is first drawn and each time the answer changes, before the
 * paint: content that has outgrown its box is never painted as drawn, and going back to as drawn is checked against a
 * fresh measure before anyone sees it. And in a ResizeObserver, whenever the box changes size: a window made narrower
 * or turned on its side, and a change of text size, which changes the height of any box padded in rem. Only the box is
 * read, never the window, so nothing here waits on a window's resize.
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
