import type { ScrollObserver } from "animejs";

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
