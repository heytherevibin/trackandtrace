import { JUMP_EVENT } from "./journey-events";
import { mastheadBottom } from "./keep-place";
import { HAND, ownScroll } from "./place-memory";
import type { JourneyContext, Teardown } from "./start-journey";

// A Tab stop's glide, taken up again (WCAG 2.4.11; Task 6 review). The browser glides a focused element outside the
// window into it (the page's smooth scroll-behavior), and an instant scroll made meanwhile to keep the reader's place
// (jumpTo: keepPlace, the still's settle, as the drawing falls to the still under load) cancels that glide, stranding
// focus off-screen at rest. Never against the reader (rounds 2–4):
// - armed only by a Tab's focus that starts a glide: a Tab keydown in the same task (focus returning to the window is
//   :focus-visible again, but no Tab moved it: round 4), :focus-visible, and let go if neither the glide's first scroll
//   nor a jump comes within six frames (a resize two frames in cuts a glide not yet scrolling: round 3);
// - taken up only after a place-keeping jump (JUMP_EVENT): a scrollbar drag, which sends no wheel, touch or key, is no
//   jump, so a reader who leaves that way is never pulled back;
// - taken up two frames after the last jump (the still settles a frame after the drawing's own jump), and again after
//   each later cut, at most three times: a resize can let the drawing decide, and the still's own jump then comes a few
//   frames after the first was taken up (round 4);
// - let go once the page has held still for ten frames, on the reader's own scroll or press, or once focus moves on.
// A station of the running window-seat run is run.ts's, which brings it to the window sideways. Motion off: no glide.

/** Frames a glide must begin in (its first scroll, or a jump that cuts it) after the focus that asks for it. */
const START = 6;
/** Frames after the last place-keeping jump before a cut glide is taken up. */
const QUIET = 2;
/** Frames the page holds still before a glide counts as over, landed or not. */
const HELD = 10;
/** The most times one glide is taken up. */
const TAKES = 3;

/** The events that let go of a glide: the reader's own scroll (place-memory's rule), and a press of the pointer. */
const OWN = [...HAND, "pointerdown"] as const;

/** The reader's own scroll, by place-memory's rule (the owner's, 2026-09-28), or a press of the pointer. */
function readersOwn(event: Event): boolean {
  return event.type === "pointerdown" || ownScroll(event);
}

export interface TabKey {
  /** A Tab keydown is being handled (Shift+Tab, and Safari's Option-Tab, which moves to links there, as well): the
   * focus it moves comes in the same task. */
  down(): boolean;
  stop(): void;
}

/** Knows a Tab for the keydown's own task: a flag a later task clears, not a timestamp (a key event is stamped with its
 * input time, which a busy page can dispatch long after: round 3). */
export function watchTab(): TabKey {
  let down = false;
  let timer = 0;
  const onKey = (event: KeyboardEvent) => {
    // Ctrl+Tab and Cmd+Tab move between the browser's tabs or the system's apps, never through the page
    if (event.key !== "Tab" || event.ctrlKey || event.metaKey) return;
    down = true;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      down = false;
    }, 0);
  };
  window.addEventListener("keydown", onKey, { capture: true, passive: true });
  return {
    down: () => down,
    stop: () => {
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(timer);
      down = false;
    },
  };
}

/** Focus the keyboard gave: it shows as :focus-visible. */
export function keyboardFocus(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return false;
  }
}

/** Wholly in the window, below the masthead's foot. */
function seen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.top >= mastheadBottom() && r.bottom <= window.innerHeight;
}

export interface GlideWatch {
  /** A glide has begun: watch it for a place-keeping jump that cuts it short. */
  arm(): void;
  disarm(): void;
  stop(): void;
}

/** Watches one glide at a time; `retake` is called each time a jump cut the glide short, at most TAKES times (rules
 * above). */
export function watchGlide(retake: () => void): GlideWatch {
  let armed = false;
  let takes = 0;
  let started = false;
  let waited = 0;
  let cut = false;
  let quiet = 0;
  let held = 0;
  let lastY = 0;
  let frame = 0;

  const disarm = () => {
    armed = false;
    cut = false;
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const tick = () => {
    frame = 0;
    if (!armed) return;
    if (!started) {
      waited += 1;
      if (waited >= START) disarm();
      else frame = requestAnimationFrame(tick);
      return;
    }
    const y = window.scrollY;
    held = y === lastY ? held + 1 : 0;
    lastY = y;
    if (cut) {
      quiet += 1;
      if (quiet >= QUIET) {
        takes += 1;
        cut = false;
        quiet = 0;
        held = 0;
        if (takes >= TAKES) disarm();
        retake();
        if (!armed) return; // the last take, or the retake let go
        lastY = window.scrollY;
      }
    } else if (held >= HELD) {
      disarm();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  const onJump = () => {
    if (!armed) return;
    started = true;
    cut = true;
    quiet = 0;
  };
  const onScroll = () => {
    if (!armed || started) return;
    started = true;
    held = 0;
    lastY = window.scrollY;
  };
  const onOwn = (event: Event) => {
    if (readersOwn(event)) disarm();
  };
  window.addEventListener(JUMP_EVENT, onJump);
  window.addEventListener("scroll", onScroll, { passive: true });
  for (const type of OWN) window.addEventListener(type, onOwn, { capture: true, passive: true });
  return {
    arm: () => {
      armed = true;
      takes = 0;
      started = false;
      waited = 0;
      cut = false;
      quiet = 0;
      held = 0;
      lastY = window.scrollY;
      if (!frame) frame = requestAnimationFrame(tick);
    },
    disarm,
    stop: () => {
      disarm();
      window.removeEventListener(JUMP_EVENT, onJump);
      window.removeEventListener("scroll", onScroll);
      for (const type of OWN) window.removeEventListener(type, onOwn, true);
    },
  };
}

export function startFocusGlide({ motion }: JourneyContext): Teardown {
  if (!motion) return () => {};
  let target: Element | null = null; // the Tab stop glided to, while watch is armed for it (onFocus and onBlur reset it)

  const tab = watchTab();
  const watch = watchGlide(() => {
    const el = target;
    if (el && el === document.activeElement && !seen(el)) el.scrollIntoView({ block: "center", inline: "nearest" });
  });
  const onFocus = (event: FocusEvent) => {
    watch.disarm();
    target = null;
    const el = event.target instanceof Element ? event.target : null;
    if (!el || !tab.down() || !keyboardFocus(el) || el.closest("#run.is-running [data-station]")) return;
    const r = el.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return; // in the viewport: the browser glides nowhere
    target = el;
    watch.arm(); // at the focus: a jump before the glide's first scroll is a cut too
  };
  const onBlur = () => {
    watch.disarm();
    target = null;
  };

  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onBlur);
  return () => {
    watch.stop();
    tab.stop();
    document.removeEventListener("focusin", onFocus);
    document.removeEventListener("focusout", onBlur);
  };
}
