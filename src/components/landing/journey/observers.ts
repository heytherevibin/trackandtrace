import type { ScrollObserver } from "animejs";
import { LAYOUT_EVENT } from "./journey-events";
import { entranceStep, phaseAfter, type EntrancePhase } from "./entrances";
import type { Kept } from "./start-journey";

// Every scroll observer the journey creates, so a layout change refreshes them all in one frame and a rebuild
// starts from none (v3's observers.js, as a module singleton instead of a window global).

const live = new Set<ScrollObserver>();
let queued = 0;

export function track<O extends ScrollObserver>(observer: O): O {
  live.add(observer);
  return observer;
}

export function untrackAll(): void {
  live.clear();
}

/** Re-measures an observer, if there is anything to re-measure. Anime adopts an observer's target on its first tick
 * after the observer is made (target null until then) and refreshes it itself as it does, reading the layout as it
 * stands then; refreshing it before that reads the null target's box and throws. So a layout change in that window
 * needs no refresh of its own, and a reverted observer needs none either. The one door for every refresh. */
export function refreshObserver(o: ScrollObserver): void {
  if (!o.reverted && o.target) o.refresh();
}

export function refreshAll(): void {
  if (queued) return;
  queued = requestAnimationFrame(() => {
    queued = 0;
    for (const o of live) {
      if (o.reverted) {
        live.delete(o);
        continue;
      }
      // never let one observer's failure stop the rest refreshing
      try {
        refreshObserver(o);
      } catch (error) {
        console.error(error);
      }
    }
  });
}

/** How many frames in a row a woken sync may leave the drawing where it stood before keepUp stops waking it (until the
 * next scroll): a drawing no wake can move is never watched frame after frame for ever. */
const IDLE_WAKES = 30;

/**
 * Anime's smoothed scroll sync (sync: SMOOTH) eases a drawn progress toward the scroll's only while its wake timer runs:
 * 500 ms of anime's clock after each scroll event, restarted by each eased step. One frame longer than that (a slow
 * device's stall) spends the whole window in a single tick, and the drawing stops short of the scroll until the reader
 * scrolls again: after a jump to 07 and one 700 ms frame, Linux WebKit left the run's train 1,500 px from its station
 * for good. So from each scroll (and layout change) until the drawing has caught up, a frame in which the drawn progress
 * stood still while it still disagrees with the scroll's wakes the sync, as a scroll event would. scene/live.ts does the
 * same inside its own render loop. Returns the teardown.
 */
export function keepUp(observer: ScrollObserver, drawn: () => number): () => void {
  let frame = 0;
  let last = Number.NaN;
  let idle = 0;
  const check = () => {
    frame = 0;
    if (observer.reverted) return;
    const p = drawn();
    if (Math.abs(observer.progress - p) <= 1e-4) return;
    if (p === last) {
      idle += 1;
      if (idle > IDLE_WAKES) return;
      observer.container.handleScroll();
    } else idle = 0;
    last = p;
    frame = requestAnimationFrame(check);
  };
  const watch = () => {
    if (frame) return;
    last = Number.NaN;
    idle = 0;
    frame = requestAnimationFrame(check);
  };
  window.addEventListener("scroll", watch, { passive: true });
  window.addEventListener(LAYOUT_EVENT, watch);
  return () => {
    cancelAnimationFrame(frame);
    frame = 0;
    window.removeEventListener("scroll", watch);
    window.removeEventListener(LAYOUT_EVENT, watch);
  };
}

/** One entrance: its trigger's box decides; arm puts the start state on, play animates to rest, settle puts the
 * server's state back (on teardown). With `once` (a section entrance) it plays once per load, remembered under that key
 * in the journey's played set; without (the berth plan), it replays each time its trigger comes back. */
export interface Entrance {
  readonly trigger: Element;
  readonly at: number;
  readonly once?: string;
  arm(): void;
  play(): void;
  settle(): void;
}

/** Checks every entrance against its trigger's live box on scroll and layout, one frame at a time. `played` is the
 * journey's own (JourneyContext.played), kept across every rebuild: a once entrance already played or seen in this
 * load starts played, so a rebuild (Motion off, then on) never plays it again. */
export function watchEntrances(entrances: readonly Entrance[], played: Kept<ReadonlySet<string>>): () => void {
  const phases = new Map<Entrance, EntrancePhase>(entrances.map((e) => [e, e.once !== undefined && played.get().has(e.once) ? "played" : "rest"]));
  let frame = 0;
  const check = () => {
    frame = 0;
    const vh = window.innerHeight;
    for (const e of entrances) {
      const once = e.once !== undefined;
      const step = entranceStep(phases.get(e) ?? "rest", e.trigger.getBoundingClientRect(), vh, e.at, once);
      if (!step) continue;
      if (step === "arm") e.arm();
      else if (step === "play") e.play();
      const next = phaseAfter(step, once);
      phases.set(e, next);
      if (next === "played" && e.once !== undefined) played.set(new Set([...played.get(), e.once]));
    }
  };
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(check);
  };
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener(LAYOUT_EVENT, queue);
  check();
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("scroll", queue);
    window.removeEventListener(LAYOUT_EVENT, queue);
    for (const e of entrances) e.settle();
  };
}
