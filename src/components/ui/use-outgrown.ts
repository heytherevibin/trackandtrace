"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** The root's font size as drawn: 16px. Larger, a reader has made the text larger (the browser's text size, or a
 * text-only zoom); half a pixel of slack for a browser that rounds. */
const DRAWN_ROOT_PX = 16.5;

/**
 * True while the reader's text is larger than drawn AND the box is narrower than `minRem` of it: the moment a table
 * that cannot wrap has outgrown its box, and should stack its rows instead. Never true at the drawn text size, whatever
 * the box's width, so what is drawn at 100% stays exactly as drawn. For the landing, where a size container (which
 * would say the same in CSS) is not allowed at the widths the journey runs (run.spec.ts; #110).
 *
 * Read in a ResizeObserver, never in the effect's own body: it reports once when it starts watching, and again
 * whenever the box changes size, which a change of text size does to any box padded in rem.
 */
export function useOutgrown<T extends HTMLElement>(minRem: number): readonly [RefObject<T | null>, boolean] {
  const box = useRef<T>(null);
  const [outgrown, setOutgrown] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      setOutgrown(root > DRAWN_ROOT_PX && el.clientWidth < minRem * root);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [minRem]);

  return [box, outgrown];
}
