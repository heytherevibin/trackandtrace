import type { ScrollObserver } from "animejs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAYOUT_EVENT } from "@/components/landing/journey/journey-events";
import { keepUp, watchEntrances, type Entrance } from "@/components/landing/journey/observers";
import { keep } from "@/components/landing/journey/start-journey";

// Anime's smoothed scroll sync eases a drawn progress toward the scroll's only while its 500 ms wake timer runs; one frame
// longer than that (a slow device's stall) ends it short, and nothing wakes it until the next scroll event (Linux WebKit:
// the run's train 1,500 px from 07 after one 700 ms frame). keepUp watches from each scroll and wakes it, as a scroll
// event would, on a frame in which the drawn progress stood still short of the scroll. A stand-in observer: its progress
// is the scroll's.
function observer(progress: number): ScrollObserver & { readonly wakes: () => number } {
  const handleScroll = vi.fn();
  const o = { progress, reverted: false, target: document.body, container: { handleScroll } };
  return Object.assign(o as unknown as ScrollObserver, { wakes: () => handleScroll.mock.calls.length });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("keepUp: anime's scroll sync, woken until the drawing catches up with the scroll", () => {
  it("wakes the sync on a frame in which the drawn progress stood still short of the scroll, and stops once caught up", () => {
    const o = observer(0.8);
    let drawn = 0.3;
    const stop = keepUp(o, () => drawn);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame(); // the first look: nothing to compare with yet
    expect(o.wakes()).toBe(0);
    vi.advanceTimersToNextFrame(); // the sync went to sleep: the progress stood still
    expect(o.wakes()).toBe(1);
    drawn = 0.8; // caught up
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(o.wakes()).toBe(1);
    stop();
  });

  it("never wakes it while anime is still easing the drawn progress (it is awake)", () => {
    const o = observer(0.8);
    let drawn = 0.3;
    const stop = keepUp(o, () => drawn);
    window.dispatchEvent(new Event("scroll"));
    for (let i = 0; i < 10; i += 1) {
      vi.advanceTimersToNextFrame();
      drawn += 0.04;
    }
    expect(o.wakes()).toBe(0);
    stop();
  });

  it("watches after a layout change too: a refresh moves the scroll's progress under a still drawing", () => {
    const o = observer(0.5);
    const stop = keepUp(o, () => 0.4);
    window.dispatchEvent(new Event(LAYOUT_EVENT));
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(o.wakes()).toBe(1);
    stop();
  });

  it("gives up on a drawing no wake moves, until the next scroll: never a frame loop for ever", () => {
    const o = observer(0.8);
    const stop = keepUp(o, () => 0.3);
    window.dispatchEvent(new Event("scroll"));
    for (let i = 0; i < 200; i += 1) vi.advanceTimersToNextFrame();
    const wakes = o.wakes();
    expect(wakes).toBeGreaterThan(0);
    expect(wakes).toBeLessThan(60);
    for (let i = 0; i < 50; i += 1) vi.advanceTimersToNextFrame();
    expect(o.wakes()).toBe(wakes);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(o.wakes()).toBe(wakes + 1);
    stop();
  });

  it("does nothing once stopped, or for a reverted observer", () => {
    const o = observer(0.8);
    const stop = keepUp(o, () => 0.3);
    stop();
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(o.wakes()).toBe(0);
    const reverted = observer(0.8);
    Object.assign(reverted, { reverted: true });
    const stopReverted = keepUp(reverted, () => 0.3);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(reverted.wakes()).toBe(0);
    stopReverted();
  });
});

/** An entrance whose trigger stands wherever `top` says (400 px tall), counting what the watcher asks of it. */
function entrance(top: () => number, key: string) {
  const calls: string[] = [];
  const trigger = document.createElement("section");
  trigger.getBoundingClientRect = () => ({ top: top(), bottom: top() + 400 }) as DOMRect;
  const e: Entrance = {
    trigger,
    at: 0.88,
    key,
    arm: () => calls.push("arm"),
    play: () => calls.push("play"),
    settle: () => calls.push("settle"),
  };
  return { e, calls };
}

describe("watchEntrances: every entrance plays once per load", () => {
  beforeEach(() => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const scroll = () => {
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
  };

  it("plays an entrance out of sight at start the first time it enters the band, never again, and remembers it in the played set", () => {
    let top = 2000;
    const { e, calls } = entrance(() => top, "rows:#record");
    const played = keep<ReadonlySet<string>>(new Set());
    const stop = watchEntrances([e], played);
    expect(calls).toEqual(["arm"]);
    top = 300;
    scroll();
    expect(calls).toEqual(["arm", "play"]);
    expect([...played.get()]).toEqual(["rows:#record"]);
    for (const at of [2000, 300, -2000, -300]) {
      top = at;
      scroll();
    }
    expect(calls).toEqual(["arm", "play"]);
    stop();
    expect(calls).toEqual(["arm", "play", "settle"]);
  });

  it("plays an entrance visible when the journey starts right then, arming and playing it at once, and never again", () => {
    let top = 100;
    const { e, calls } = entrance(() => top, "kicker:0");
    const played = keep<ReadonlySet<string>>(new Set());
    const stop = watchEntrances([e], played);
    expect(calls).toEqual(["arm", "play"]);
    expect([...played.get()]).toEqual(["kicker:0"]);
    for (const at of [2000, 300]) {
      top = at;
      scroll();
    }
    expect(calls).toEqual(["arm", "play"]);
    stop();
  });

  it("plays one only peeking in at the window's foot at start, at start too", () => {
    const { e, calls } = entrance(() => 750, "board");
    const played = keep<ReadonlySet<string>>(new Set());
    const stop = watchEntrances([e], played);
    expect(calls).toEqual(["arm", "play"]);
    stop();
  });

  it("never replays, after a rebuild (Motion off, then on), an entrance already played in this load: the berth plan too", () => {
    let top = 2000;
    const played = keep<ReadonlySet<string>>(new Set());
    const first = entrance(() => top, "berths");
    const stop = watchEntrances([first.e], played);
    top = 300;
    scroll();
    top = 2000;
    scroll();
    stop();
    const rebuilt = entrance(() => top, "berths");
    const stopRebuilt = watchEntrances([rebuilt.e], played);
    top = 300;
    scroll();
    expect(first.calls).toEqual(["arm", "play", "settle"]);
    expect(rebuilt.calls).toEqual([]);
    stopRebuilt();
  });
});
