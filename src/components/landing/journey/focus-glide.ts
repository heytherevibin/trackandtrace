import { JUMP_EVENT } from "./journey-events";
import { mastheadBottom } from "./keep-place";
import { HAND, ownScroll } from "./place-memory";
import type { JourneyContext, Teardown } from "./start-journey";

// A Tab stop's glide, taken up again (WCAG 2.4.11; Task 6 review). The browser glides a focused element outside the
// window into it (the page's smooth scroll-behavior), and an instant scroll made meanwhile to keep the reader's place
// (jumpTo: keepPlace, the still's settle, as the drawing falls to the still under load) cancels that glide, stranding
// focus off-screen at rest. Never against the reader (round 2):
// - armed only by keyboard focus that starts a glide: :focus-visible, and a scroll within a few frames;
// - taken up only after a place-keeping jump (JUMP_EVENT): a scrollbar drag, which sends no wheel, touch or key, is no
//   jump, so a reader who leaves that way is never pulled back;
// - taken up once, two frames after the last jump (the still settles a frame after the drawing's own jump);
// - let go once the page has held still for ten frames, on the reader's own scroll or press, or once focus moves on.
// A station of the running window-seat run is run.ts's, which brings it to the window sideways. Motion off: no glide.

/** Frames a glide must begin in after the focus that asks for it. */
const START = 3;
/** Frames after the last place-keeping jump before a cut glide is taken up. */
const QUIET = 2;
/** Frames the page holds still before a glide counts as over, landed or not. */
const HELD = 10;

/** The events that let go of a glide: the reader's own scroll (place-memory's rule), and a press of the pointer. */
const OWN = [...HAND, "pointerdown"] as const;

/** The reader's own scroll, by place-memory's rule (the owner's, 2026-09-28), or a press of the pointer. */
function readersOwn(event: Event): boolean {
  return event.type === "pointerdown" || ownScroll(event);
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

/** Watches one glide at a time; `retake` is called at most once, when a jump cut the glide short (rules above). */
export function watchGlide(retake: () => void): GlideWatch {
  let armed = false;
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
    const y = window.scrollY;
    held = y === lastY ? held + 1 : 0;
    lastY = y;
    if (cut) {
      quiet += 1;
      if (quiet >= QUIET) {
        disarm();
        retake();
        return;
      }
    } else if (held >= HELD) {
      disarm();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  const onJump = () => {
    if (!armed) return;
    cut = true;
    quiet = 0;
  };
  const onOwn = (event: Event) => {
    if (readersOwn(event)) disarm();
  };
  window.addEventListener(JUMP_EVENT, onJump);
  for (const type of OWN) window.addEventListener(type, onOwn, { capture: true, passive: true });
  return {
    arm: () => {
      armed = true;
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
      for (const type of OWN) window.removeEventListener(type, onOwn, true);
    },
  };
}

export function startFocusGlide({ motion }: JourneyContext): Teardown {
  if (!motion) return () => {};
  let target: Element | null = null;
  let candidate: Element | null = null;
  let age = 0;
  let ageFrame = 0;

  const watch = watchGlide(() => {
    const el = target;
    target = null;
    if (el && el === document.activeElement && !seen(el)) el.scrollIntoView({ block: "center", inline: "nearest" });
  });
  const forget = () => {
    candidate = null;
    cancelAnimationFrame(ageFrame);
    ageFrame = 0;
  };
  const ageing = () => {
    ageFrame = 0;
    age += 1;
    if (age >= START) forget();
    else if (candidate) ageFrame = requestAnimationFrame(ageing);
  };
  const onFocus = (event: FocusEvent) => {
    watch.disarm();
    target = null;
    forget();
    const el = event.target instanceof Element ? event.target : null;
    if (!el || !keyboardFocus(el) || el.closest("#run.is-running [data-station]")) return;
    const r = el.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return; // in the viewport: the browser glides nowhere
    candidate = el;
    age = 0;
    ageFrame = requestAnimationFrame(ageing);
  };
  const onScroll = () => {
    if (!candidate) return;
    target = candidate;
    forget();
    watch.arm();
  };
  const onBlur = () => {
    watch.disarm();
    target = null;
    forget();
  };

  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onBlur);
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    forget();
    watch.stop();
    document.removeEventListener("focusin", onFocus);
    document.removeEventListener("focusout", onBlur);
    window.removeEventListener("scroll", onScroll);
  };
}
