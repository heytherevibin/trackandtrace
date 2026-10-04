"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";

/** The scrollers the traveller site has, by name: tests/e2e/layout.ts lists where each may scroll, and nowhere else. */
export type ScrollRegionName = "passengers" | "availability" | "watchlist";

/**
 * A box that scrolls sideways when what it holds is wider than it: a table that cannot reflow (four columns of figures,
 * the text at 200% in a window too narrow for them). WCAG 1.4.10 allows that for a table, on condition a reader can
 * reach the scroll: so, only while its content really is wider, the box is a named region in the Tab order (the arrow
 * keys scroll a focused scroller). While the content fits it is a plain box: no landmark, no extra Tab stop, and the
 * same box it always was, so nothing moves at the drawn sizes.
 *
 * The widths are read in a ResizeObserver, never in the effect's own body: the observer reports once when it starts
 * watching, and again when the box or its content changes size (a text-size change, a rotation, rows arriving). Until
 * its first report the box says it has not measured itself (`data-scrolls="pending"`), then `yes` or `no`: a test waits
 * on that, not on a clock.
 *
 * A region that stops overflowing while it holds focus (the window widened, the text made smaller) stays in the Tab
 * order, named, until focus leaves it: taking `tabindex` off the focused element would drop focus to the body.
 */
export function ScrollRegion({
  name,
  label,
  labelledBy,
  className,
  children,
}: {
  readonly name: ScrollRegionName;
  /** The region's accessible name; or `labelledBy`, the id of the element that names it. */
  readonly label?: string;
  readonly labelledBy?: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState<boolean | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setScrolls(el.scrollWidth > el.clientWidth + 1));
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);

  const named = labelledBy ? { "aria-labelledby": labelledBy } : { "aria-label": label };
  return (
    <div
      ref={box}
      data-scroll-region={name}
      data-scrolls={scrolls === null ? "pending" : scrolls ? "yes" : "no"}
      // `relative`: so a visually hidden heading inside stays inside (scrollers.contract.test.ts).
      className={cn("relative overflow-x-auto focus-visible:-outline-offset-2", className)}
      onFocus={(event) => {
        if (event.target === event.currentTarget) setFocused(true);
      }}
      onBlur={(event) => {
        if (event.target === event.currentTarget) setFocused(false);
      }}
      {...(scrolls === true || focused ? { role: "region", tabIndex: 0, ...named } : {})}
    >
      {children}
    </div>
  );
}
