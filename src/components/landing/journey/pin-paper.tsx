/**
 * The paper under a pinned stage (owner, 2026-09-30): a full-bleed sheet of the page's grain, the last child of 02, the
 * drawing and the run. It is drawn only while its stage is pinned (journey-island.css), where it sticks exactly as the pin
 * does, below the live drawing's canvas, so the whole window's grain holds still with the stage and moves with the page
 * again once it lets go. Nothing else: no text, no events, not in the accessibility tree.
 */
export function PinPaper() {
  return <div className="pin-paper" aria-hidden="true" />;
}
