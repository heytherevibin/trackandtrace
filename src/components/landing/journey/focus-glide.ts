import { JUMP_EVENT, LAYOUT_EVENT } from "./journey-events";
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
// A relayout cuts a glide short too (the owner, 2026-09-28): the browser sets a glide's end as it begins, so a piece that
// grows or shrinks between the reader and the link (the live drawing pinning a frame after the Tab: island.spec's 3 in
// 190 under load; a late font; a resize) moves the link past that end with no jump to say so, and the glide lands where
// the link was. Taken up under the same bounds, and only:
// - when the relayout (tt:layout, or the window's resize) moved the link on the page, not for every announcement;
// - while the page stands between where the glide began and the farthest a reveal could take it: a scrollbar drag that
//   took the reader out of that span is theirs (run.ts's rule for its own stations, final review I2), and once a
//   relayout or a rebuild finds the page off it the glide is let go (a jump alone still takes the glide up, as in J6);
// - through the journey's rebuild (a late font changing a piece's fit), which tears this module down and starts it again
//   in one task: the new start takes up the glide the old one watched, with the takes it had left, on the same course
//   rule (review F1).
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

/** The reader's own scroll, by place-memory's rule (the owner's, 2026-09-28 and 2026-09-29: Tab too, Space only where
 * it scrolls), or a press of the pointer. */
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
  /** A glide has begun: watch it for a place-keeping jump that cuts it short. `taken`: the takes it has already had (one
   * carried through the journey's rebuild). */
  arm(taken?: number): void;
  /** Still watching the glide it was armed for: not let go by the reader's own scroll or pointer, nor by the page. */
  armed(): boolean;
  /** Something other than a jump cut the glide short (a relayout): taken up as a jump's cut is. */
  cut(): void;
  /** The times the glide it watches has been taken up. */
  taken(): number;
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
    arm: (taken = 0) => {
      armed = true;
      takes = taken;
      started = false;
      waited = 0;
      cut = false;
      quiet = 0;
      held = 0;
      lastY = window.scrollY;
      if (!frame) frame = requestAnimationFrame(tick);
    },
    armed: () => armed,
    cut: onJump,
    taken: () => takes,
    disarm,
    stop: () => {
      disarm();
      window.removeEventListener(JUMP_EVENT, onJump);
      window.removeEventListener("scroll", onScroll);
      for (const type of OWN) window.removeEventListener(type, onOwn, true);
    },
  };
}

/** A station of the running window-seat run: run.ts brings it to the window, sideways. */
const RUNNING = "#run.is-running [data-station]";

/** A glide watched as the journey rebuilds: left by the teardown, taken by the start in the same task (the rebuild starts
 * every module before it returns: start-journey.ts), and dropped after it. */
interface Handover {
  readonly target: Element;
  readonly taken: number;
  readonly course: Course;
  readonly lastY: number;
}
let handover: Handover | null = null;

/** Where a glide may take the page: from where it stands to the farthest a reveal of `el` could scroll it (its top at the
 * masthead's foot going down, its foot at the window's going up), and where `el` stands on the page. */
interface Course {
  readonly low: number;
  readonly high: number;
  readonly place: number;
}
/** Whether the page, at `y`, still stood on the glide's course. */
function onCourse(y: number, course: Course): boolean {
  return y >= course.low - 1 && y <= course.high + 1;
}

function courseTo(el: Element): Course {
  const r = el.getBoundingClientRect();
  const from = window.scrollY;
  const to = from + (r.bottom > window.innerHeight ? r.top - mastheadBottom() : r.bottom - window.innerHeight);
  return { low: Math.min(from, to), high: Math.max(from, to), place: r.top + from };
}

export function startFocusGlide({ motion }: JourneyContext): Teardown {
  if (!motion) return () => {};
  let target: Element | null = null; // the Tab stop glided to, while watch is armed for it (onFocus and onBlur reset it)
  let course: Course | null = null; // the glide's, from the Tab, the last jump or the last take
  let lastY = 0; // the page's scroll as the last scroll event found it: a relayout's own anchoring comes after it

  const aim = (el: Element) => {
    course = courseTo(el);
    lastY = window.scrollY;
  };
  const tab = watchTab();
  const watch = watchGlide(() => {
    const el = target;
    if (!el || el.closest(RUNNING)) return; // the run pinned under the glide: run.ts's
    if (el === document.activeElement && !seen(el)) el.scrollIntoView({ block: "center", inline: "nearest" });
    aim(el);
  });
  const onFocus = (event: FocusEvent) => {
    watch.disarm();
    target = null;
    const el = event.target instanceof Element ? event.target : null;
    if (!el || !tab.down() || !keyboardFocus(el) || el.closest(RUNNING)) return;
    const r = el.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return; // in the viewport: the browser glides nowhere
    target = el;
    aim(el);
    watch.arm(); // at the focus: a jump before the glide's first scroll is a cut too
  };
  const onBlur = () => {
    watch.disarm();
    target = null;
  };
  const onScroll = () => {
    lastY = window.scrollY;
  };
  /** A place-keeping jump: watchGlide's cut. The glide's course starts again from where it put the page. */
  const onJump = () => {
    if (target && watch.armed()) aim(target);
  };
  const letGo = () => {
    watch.disarm();
    target = null;
  };
  /** A relayout: a cut when it moved the link on the page, and the page, until it, stood on the glide's course; the glide
   * let go when the page stood off it, or when the run pinned under it (run.ts's then). */
  const onLayout = () => {
    const el = target;
    const was = course;
    if (!el || !was || !watch.armed()) return;
    if (el.closest(RUNNING)) return letGo();
    const place = el.getBoundingClientRect().top + window.scrollY;
    if (Math.abs(place - was.place) < 1) return; // the link stands where it did: the glide still ends at it
    if (!onCourse(lastY, was)) {
      // off the glide's course before the page moved: the reader took the page there, and it stays theirs
      return letGo();
    }
    aim(el);
    watch.cut();
  };

  // The rebuild's teardown left a glide it watched: taken up here, since the rebuild itself relaid the page out, if the
  // page stood on its course until the rebuild (a reader a drag took off it keeps their place: review F1).
  const passed = handover;
  handover = null;
  if (
    passed &&
    onCourse(passed.lastY, passed.course) &&
    passed.target === document.activeElement &&
    passed.target.isConnected &&
    !passed.target.closest(RUNNING)
  ) {
    target = passed.target;
    aim(passed.target);
    watch.arm(passed.taken);
    watch.cut();
  }

  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onBlur);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener(JUMP_EVENT, onJump);
  window.addEventListener(LAYOUT_EVENT, onLayout);
  window.addEventListener("resize", onLayout);
  return () => {
    if (target && course && watch.armed()) {
      const left: Handover = { target, taken: watch.taken(), course, lastY };
      handover = left;
      queueMicrotask(() => {
        if (handover === left) handover = null;
      });
    }
    watch.stop();
    tab.stop();
    document.removeEventListener("focusin", onFocus);
    document.removeEventListener("focusout", onBlur);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener(JUMP_EVENT, onJump);
    window.removeEventListener(LAYOUT_EVENT, onLayout);
    window.removeEventListener("resize", onLayout);
  };
}
