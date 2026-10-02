import { followGlide, type GlideFollower } from "./glide-follower";
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
//
// An in-page link's glide is cut short the same two ways (the reviewer, 2026-10-01: a phone's toolbar resizing the window
// a few frames into a tapped link's glide left the reader short of its section in 4 runs in 10), and is taken up under the
// same bounds: armed by the click, taken up after a jump or a relayout that moved its target, while the page stood on the
// glide's course, at most three times, and let go on the reader's own scroll or press. What it is taken up to is the
// link's target at its landing (its scroll margin), while the address still names it. Every rule for a Tab's glide stands
// as it was. A link to a section of the running run is run.ts's, as its stations are.
// The browser's own scroll anchoring is held off while a link's glide is watched (arm's `link`): WebKit's, answering the
// resize, stopped the glide where it stood with no jump, no "resize" and nothing else to hear (short of 07 by 2,100 px in
// 10 of 115 runs, none in 105 with it held off). The page keeps its own places without it, as on every browser that has
// none, and it comes back as the watch lets go.
// A link's glide runs the whole way to its target, so "between the two" says nothing of who is moving the page: a
// scrollbar's drag (no wheel, touch, key or press) anywhere short of the target stood on its course, and a resize then
// carried that reader on to the target (the review, 2026-10-02). So a link's glide is followed frame by frame against
// the end the browser set for it (glide-follower.ts): a page that stands still short of that end, or goes back, is the
// reader's own hand, nothing is taken up while that is in doubt, and the span rule is not asked. A Tab's glide is not
// followed so: its rules are as they were.

/** Frames a glide must begin in (its first scroll, or a jump that cuts it) after the focus that asks for it. */
const START = 6;
/** The same for a link's glide: the router's own link glides frames after its click, the page a few after that. */
const START_LINK = 30;
/** Frames a link's glide just taken up may leave the page still before it is asked for again: WebKit, its own glide
 * stopped by the journey's rebuild in that frame, now and then takes the page to stand at that glide's end already and
 * begins none toward it (9 runs in 120, the reader left up to 6,100 px short of 08; a glide by 300 px from there ended
 * 300 px past the target). An instant scroll to where the page does stand puts that right; then asked again as a cut
 * is, within the same three takes. */
const UNBEGUN = 6;
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

/** Outside the window, where the browser glides a Tab stop in: one already in view scrolls nothing. The drawing holds its
 * pin through that glide by the same rule (drawing.ts). */
export function glidesTo(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.top < 0 || r.bottom > window.innerHeight;
}

/** Wholly in the window, below the masthead's foot. */
function seen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.top >= mastheadBottom() && r.bottom <= window.innerHeight;
}

export interface GlideWatch {
  /** A glide has begun: watch it for a place-keeping jump that cuts it short. `taken`: the takes it has already had (one
   * carried through the journey's rebuild). `end`: where the browser is gliding the page to, for an in-page link's
   * glide: followed frame by frame (followGlide), scroll anchoring held off while it is watched. `unsure`: the click may
   * glide nowhere (its default was prevented), so nothing is taken up for it until the page has moved toward `end`. */
  arm(taken?: number, end?: number, unsure?: boolean): void;
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
 * above). For a link's glide it returns the end of the glide it began, or nothing when it began none. */
export function watchGlide(retake: () => number | void): GlideWatch {
  let armed = false;
  let takes = 0;
  let started = false;
  let waited = 0;
  let cut = false;
  let quiet = 0;
  let held = 0;
  let lastY = 0;
  let frame = 0;
  let unanchored = false;
  let follower: GlideFollower | null = null; // a link's glide, followed
  let unsure = false; // a link's glide that may never begin (arm)
  let unbegun = -1; // frames a link's glide just taken up has left the page still; -1 once it moves, or with none asked

  /** Scroll anchoring held off (<html style="overflow-anchor: none">), or given back. */
  const anchoring = (off: boolean) => {
    if (off === unanchored) return;
    unanchored = off;
    if (off) document.documentElement.style.setProperty("overflow-anchor", "none");
    else document.documentElement.style.removeProperty("overflow-anchor");
  };
  const disarm = () => {
    armed = false;
    cut = false;
    cancelAnimationFrame(frame);
    frame = 0;
    follower = null;
    unbegun = -1;
    anchoring(false);
  };
  const tick = () => {
    frame = 0;
    if (!armed) return;
    if (!started) {
      waited += 1;
      if (waited >= (follower ? START_LINK : START)) disarm();
      else frame = requestAnimationFrame(tick);
      return;
    }
    const y = window.scrollY;
    if (follower && !follower.step(y)) return disarm(); // the reader's own hand on the page (a scrollbar's drag)
    held = y === lastY ? held + 1 : 0;
    if (unbegun >= 0) unbegun = y === lastY ? unbegun + 1 : -1;
    lastY = y;
    if (unbegun >= UNBEGUN) {
      unbegun = -1;
      window.scrollTo({ top: y, behavior: "instant" });
      onCut();
    }
    // Nothing is taken up while a frame's doubt stands (a hand that stopped as the cut landed is known a frame later), nor
    // for a click that may glide nowhere until the page has moved toward its target.
    const wait = follower !== null && (follower.doubting() || (unsure && !follower.begun()));
    if (cut && !wait) {
      quiet += 1;
      if (quiet >= QUIET) {
        takes += 1;
        cut = false;
        quiet = 0;
        held = 0;
        if (takes >= TAKES) disarm();
        const end = retake();
        if (!armed) return; // the last take, or the retake let go
        lastY = window.scrollY;
        if (follower && typeof end === "number") {
          follower = followGlide(lastY, end);
          unbegun = 0;
        }
      }
    } else if (held >= HELD) {
      disarm();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  const onCut = () => {
    if (!armed) return;
    started = true;
    cut = true;
    quiet = 0;
  };
  const onJump = () => {
    onCut();
    follower?.jumped();
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
    arm: (taken = 0, end, maybe = false) => {
      unsure = maybe;
      anchoring(end !== undefined);
      follower = end === undefined ? null : followGlide(window.scrollY, end);
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
    cut: onCut,
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
/** The running run, whose sections a link is brought to by run.ts. */
const RUN = "#run.is-running";
/** A link to a place in this page. */
const IN_PAGE = 'a[href^="#"]';

/** How far below the window's top a link to `el` lands it: its scroll margin. */
function landingOf(el: Element): number {
  return Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
}

/** A glide watched as the journey rebuilds: left by the teardown, taken by the start in the same task (the rebuild starts
 * every module before it returns: start-journey.ts), and dropped after it. */
interface Handover {
  readonly target: Element;
  readonly taken: number;
  readonly course: Course;
  readonly lastY: number;
  /** The glide is an in-page link's to its target, not a Tab's to its stop. */
  readonly linked: boolean;
}
let handover: Handover | null = null;

/** Where a glide may take the page: from where it stands to the farthest a reveal of `el` could scroll it (its top at the
 * masthead's foot going down, its foot at the window's going up), and where `el` stands on the page. */
interface Course {
  readonly low: number;
  readonly high: number;
  readonly place: number;
  /** Where the browser glides the page to: a link's target at its landing, or as near as the page scrolls. */
  readonly end: number;
}
/** Whether the page, at `y`, still stood on the glide's course. */
function onCourse(y: number, course: Course): boolean {
  return y >= course.low - 1 && y <= course.high + 1;
}

function courseTo(el: Element): Course {
  const r = el.getBoundingClientRect();
  const from = window.scrollY;
  const to = from + (r.bottom > window.innerHeight ? r.top - mastheadBottom() : r.bottom - window.innerHeight);
  return { low: Math.min(from, to), high: Math.max(from, to), place: r.top + from, end: to };
}

/** An in-page link's glide to `el`: from where the page stands to `el`'s top at its landing. */
function courseToStart(el: Element): Course {
  const top = el.getBoundingClientRect().top;
  const from = window.scrollY;
  const foot = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const to = Math.min(foot, Math.max(0, from + top - landingOf(el)));
  return { low: Math.min(from, to), high: Math.max(from, to), place: top + from, end: to };
}

export function startFocusGlide({ motion }: JourneyContext): Teardown {
  if (!motion) return () => {};
  let target: Element | null = null; // the Tab stop glided to, while watch is armed for it (onFocus and onBlur reset it)
  let linked = false; // target is an in-page link's, glided to by its click, not a Tab stop
  let course: Course | null = null; // the glide's, from the Tab, the last jump or the last take
  let lastY = 0; // the page's scroll as the last scroll event found it: a relayout's own anchoring comes after it

  const aim = (el: Element): Course => {
    const next = linked ? courseToStart(el) : courseTo(el);
    course = next;
    lastY = window.scrollY;
    return next;
  };
  /** The run's own to bring to the window: a Tab stop in a running station, a link's target in the running run. */
  const runs = (el: Element) => el.closest(linked ? RUN : RUNNING) !== null;
  const tab = watchTab();
  const watch = watchGlide(() => {
    const el = target;
    if (!el || runs(el)) return; // the run pinned under the glide: run.ts's
    if (linked) {
      // its target back to its landing, while the address still names it (the reader has not gone elsewhere)
      const to = aim(el).end;
      if (!el.isConnected || window.location.hash !== `#${el.id}` || Math.abs(to - window.scrollY) < 1) return;
      el.scrollIntoView({ block: "start" });
      return to;
    }
    if (el === document.activeElement && !seen(el)) el.scrollIntoView({ block: "center", inline: "nearest" });
    aim(el);
  });
  const onFocus = (event: FocusEvent) => {
    // a link's glide is not focus's: the browser moving focus to the link or its target lets go of nothing; a Tab does
    if (linked && !tab.down()) return;
    watch.disarm();
    target = null;
    linked = false;
    const el = event.target instanceof Element ? event.target : null;
    if (!el || !tab.down() || !keyboardFocus(el) || el.closest(RUNNING)) return;
    if (!glidesTo(el)) return; // in the viewport: the browser glides nowhere
    target = el;
    aim(el);
    watch.arm(); // at the focus: a jump before the glide's first scroll is a cut too
  };
  const onBlur = () => {
    if (linked) return; // a link's glide is not focus's (onFocus)
    watch.disarm();
    target = null;
  };
  /** A click on an in-page link, unmodified, that glides the page to its target: watched from the click, as a Tab's glide
   * is from its focus. Its default prevented or not: the router's own link (the masthead's to the terminal) prevents it
   * and glides to the fragment itself; a click that glides nowhere is let go half a second on (START_LINK), and nothing
   * is taken up for it meanwhile (arm's `unsure`). */
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>(IN_PAGE) : null;
    const el = link ? document.getElementById(link.hash.slice(1)) : null;
    if (!el || el.closest(RUN)) return; // nowhere in this page, or the running run's (run.ts)
    watch.disarm();
    target = el;
    linked = true;
    // unsure it glides at all: its default prevented, and the address naming its target already (nothing shows it went
    // anywhere). A prevented click that does go there changes the address (the router's), and the address rule holds it.
    watch.arm(0, aim(el).end, event.defaultPrevented && window.location.hash === `#${el.id}`);
  };
  const onScroll = () => {
    lastY = window.scrollY;
  };
  /** Back mid-glide (a link's own navigation tells popstate too, the address naming its target): let go for good. */
  const onPop = () => {
    if (linked && target && window.location.hash !== `#${target.id}`) letGo();
  };
  /** A place-keeping jump: watchGlide's cut. The glide's course starts again from where it put the page. */
  const onJump = () => {
    if (target && watch.armed()) aim(target);
  };
  const letGo = () => {
    watch.disarm();
    target = null;
    linked = false;
  };
  /** A relayout: a cut when it moved the link on the page, and the page, until it, stood on the glide's course; the glide
   * let go when the page stood off it, or when the run pinned under it (run.ts's then). */
  const onLayout = () => {
    const el = target;
    const was = course;
    if (!el || !was || !watch.armed()) return;
    if (runs(el)) return letGo();
    const place = el.getBoundingClientRect().top + window.scrollY;
    if (Math.abs(place - was.place) < 1) return; // the link stands where it did: the glide still ends at it
    // a link's glide is told from the reader's hand frame by frame, not by its span (glide-follower.ts)
    if (!linked && !onCourse(lastY, was)) {
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
    (passed.linked ? window.location.hash === `#${passed.target.id}` : passed.target === document.activeElement) &&
    passed.target.isConnected &&
    !passed.target.closest(passed.linked ? RUN : RUNNING)
  ) {
    target = passed.target;
    linked = passed.linked;
    const end = aim(passed.target).end;
    watch.arm(passed.taken, passed.linked ? end : undefined);
    watch.cut();
  }

  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onBlur);
  document.addEventListener("click", onClick);
  window.addEventListener("popstate", onPop);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener(JUMP_EVENT, onJump);
  window.addEventListener(LAYOUT_EVENT, onLayout);
  window.addEventListener("resize", onLayout);
  return () => {
    if (target && course && watch.armed()) {
      const left: Handover = { target, taken: watch.taken(), course, lastY, linked };
      handover = left;
      queueMicrotask(() => {
        if (handover === left) handover = null;
      });
    }
    watch.stop();
    tab.stop();
    document.removeEventListener("focusin", onFocus);
    document.removeEventListener("focusout", onBlur);
    document.removeEventListener("click", onClick);
    window.removeEventListener("popstate", onPop);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener(JUMP_EVENT, onJump);
    window.removeEventListener(LAYOUT_EVENT, onLayout);
    window.removeEventListener("resize", onLayout);
  };
}
