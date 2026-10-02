"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * A box that scrolls sideways when what it holds is wider than it: a table that cannot reflow (four columns of figures,
 * the text at 200% in a window too narrow for them). WCAG 1.4.10 allows that for a table, on condition a reader can
 * reach the scroll: so, only while its content really is wider, the box is a named region in the Tab order (the arrow
 * keys scroll a focused scroller). While the content fits it is a plain box: no landmark, no extra Tab stop, and the
 * same box it always was, so nothing moves at the drawn sizes.
 *
 * The widths are read in a ResizeObserver, never in the effect's own body: the observer reports once when it starts
 * watching, and again when the box or its content changes size (a text-size change, a rotation, rows arriving).
 */
export function ScrollRegion({
  label,
  labelledBy,
  className,
  children,
}: {
  /** The region's name; or `labelledBy`, the id of the heading that names it. */
  readonly label?: string;
  readonly labelledBy?: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setScrolls(el.scrollWidth > el.clientWidth + 1));
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);

  const name = labelledBy ? { "aria-labelledby": labelledBy } : { "aria-label": label };
  return (
    <div ref={box} className={cn("overflow-x-auto focus-visible:-outline-offset-2", className)} {...(scrolls ? { role: "region", tabIndex: 0, ...name } : {})}>
      {children}
    </div>
  );
}
