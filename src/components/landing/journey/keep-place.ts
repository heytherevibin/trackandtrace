import { placeAfter } from "./drawing-mode";

// The one way a pinned piece changes its own height (J5-3): the change runs, then the reader lands where placeAfter
// says, judged from the piece's box just before. drawing.ts (the live drawing's pin) and run.ts (the window-seat run's)
// change their heights only through here. It writes the scroll only.

export function mastheadBottom(): number {
  return Math.round(document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
}

/** Runs a change to the piece, then puts the reader where placeAfter says. A piece already gone from the document (a
 * client navigation away) just changes. */
export function keepPlace(section: HTMLElement | null, change: () => void): void {
  if (!section?.isConnected) {
    change();
    return;
  }
  const before = section.getBoundingClientRect();
  const scrollY = window.scrollY;
  change();
  const after = section.getBoundingClientRect();
  // A shrink near the page's foot clamps the scroll as the change lays out: its box is then read against the clamped
  // scroll, and put back against the one before, so a reader inside it still lands on its start.
  const drift = window.scrollY - scrollY;
  const to = placeAfter(before, { top: after.top + drift, height: after.height }, { scrollY, viewport: window.innerHeight, masthead: mastheadBottom() });
  if (to !== null) window.scrollTo({ top: to, behavior: "instant" });
}
