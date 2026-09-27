import { LAYOUT_EVENT } from "./journey-events";
import { mastheadBottom } from "./keep-place";
import type { JourneyContext, Teardown } from "./start-journey";

// A Tab stop's glide, taken up again (WCAG 2.4.11; Task 6 review). The browser glides a focused element outside the
// window into it (the page's smooth scroll-behavior), and an instant scroll made meanwhile to keep the reader's place
// (keepPlace, the still's settle: the drawing falling to the still under load) cancels that glide, stranding focus
// off-screen at rest. After a layout change, the one every such move announces, the glide is begun again, centred so
// the masthead never covers it: while focus is still there and it has neither landed nor met the reader's own scroll.
// A station of the running window-seat run is run.ts's, which brings it to the window sideways. Motion off: nothing
// glides.

/** The keys that scroll the page: with a wheel or a finger, the reader's own scroll. */
export const SCROLL_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
export const OWN_SCROLL = ["wheel", "touchmove", "keydown"] as const;

/** One of OWN_SCROLL's events that is the reader's own scroll: any wheel or touchmove, and a key that scrolls. */
export function ownScroll(event: Event): boolean {
  return !(event instanceof KeyboardEvent) || SCROLL_KEYS.has(event.key);
}

/** Wholly in the window, below the masthead's foot. */
function seen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.top >= mastheadBottom() && r.bottom <= window.innerHeight;
}

export function startFocusGlide({ motion }: JourneyContext): Teardown {
  if (!motion) return () => {};
  let pending: Element | null = null;
  let frame = 0;

  const onFocus = (event: FocusEvent) => {
    const el = event.target instanceof Element ? event.target : null;
    const r = el?.getBoundingClientRect();
    // only a glide the browser begins: the element outside the viewport, and not a station the run brings sideways
    const glides = el !== null && r !== undefined && (r.top < 0 || r.bottom > window.innerHeight) && !el.closest("#run.is-running [data-station]");
    pending = glides ? el : null;
  };
  const onScrollEnd = () => {
    if (pending && seen(pending)) pending = null;
  };
  const onOwn = (event: Event) => {
    if (ownScroll(event)) pending = null;
  };
  const check = () => {
    frame = 0;
    const el = pending;
    if (!el) return;
    if (el !== document.activeElement) pending = null;
    else if (!seen(el)) el.scrollIntoView({ block: "center", inline: "nearest" });
  };
  const onLayout = () => {
    if (pending && !frame) frame = requestAnimationFrame(check);
  };

  document.addEventListener("focusin", onFocus);
  window.addEventListener("scrollend", onScrollEnd);
  for (const type of OWN_SCROLL) window.addEventListener(type, onOwn, { capture: true, passive: true });
  window.addEventListener(LAYOUT_EVENT, onLayout);
  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener("focusin", onFocus);
    window.removeEventListener("scrollend", onScrollEnd);
    for (const type of OWN_SCROLL) window.removeEventListener(type, onOwn, true);
    window.removeEventListener(LAYOUT_EVENT, onLayout);
  };
}
