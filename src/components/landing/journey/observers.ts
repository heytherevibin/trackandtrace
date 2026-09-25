import type { ScrollObserver } from "animejs";
import { LAYOUT_EVENT } from "./journey-events";
import { entranceStep, type EntrancePhase } from "./entrances";

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

export function refreshAll(): void {
  if (queued) return;
  queued = requestAnimationFrame(() => {
    queued = 0;
    for (const o of live) {
      if (o.reverted) live.delete(o);
      else o.refresh();
    }
  });
}

/** One replaying entrance: its trigger's box decides; arm puts the start state on, play animates to rest,
 * settle puts the server's state back (on teardown). */
export interface Entrance {
  readonly trigger: Element;
  readonly at: number;
  arm(): void;
  play(): void;
  settle(): void;
}

/** Checks every entrance against its trigger's live box on scroll and layout, one frame at a time. */
export function watchEntrances(entrances: readonly Entrance[]): () => void {
  const phases = new Map<Entrance, EntrancePhase>(entrances.map((e) => [e, "rest"]));
  let frame = 0;
  const check = () => {
    frame = 0;
    const vh = window.innerHeight;
    for (const e of entrances) {
      const step = entranceStep(phases.get(e) ?? "rest", e.trigger.getBoundingClientRect(), vh, e.at);
      if (step === "arm") {
        e.arm();
        phases.set(e, "armed");
      } else if (step === "play") {
        e.play();
        phases.set(e, "rest");
      }
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
