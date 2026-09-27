import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOTION_EVENT } from "@/components/motion/use-motion";

// The journey's first build at load, a module at a time (spec §3.H: no journey task at load over 120 ms at 4× CPU;
// one task starting all of them measured 128–154 ms). Between modules it waits for the page; the pause is held here
// so the test decides when each wait ends. The first module and the last are watched.

const gate = vi.hoisted(() => ({ waits: [] as Array<() => void> }));
vi.mock("@/components/landing/journey/pause", () => ({ pause: () => new Promise<void>((resolve) => gate.waits.push(resolve)) }));

const first = vi.hoisted(() => vi.fn());
const last = vi.hoisted(() => vi.fn());
vi.mock("@/components/landing/journey/arrivals", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/landing/journey/arrivals")>();
  return { ...real, startArrivals: (...args: Parameters<typeof real.startArrivals>) => (first(), real.startArrivals(...args)) };
});
vi.mock("@/components/landing/journey/still", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/landing/journey/still")>();
  return { ...real, startStill: (...args: Parameters<typeof real.startStill>) => (last(), real.startStill(...args)) };
});

import { LAYOUT_EVENT } from "@/components/landing/journey/journey-events";
import { MODULES, startJourney } from "@/components/landing/journey/start-journey";

/** Ends the oldest wait, then lets the build's continuation run. */
async function release(): Promise<void> {
  gate.waits.shift()?.();
  await Promise.resolve();
  await Promise.resolve();
}

/** Long enough for a few animation frames. */
const frames = () => new Promise((resolve) => setTimeout(resolve, 60));

async function releaseAll(): Promise<number> {
  let n = 0;
  while (gate.waits.length) {
    await release();
    n += 1;
  }
  return n;
}

describe("startJourney's first build, a module at a time (spec §3.H)", () => {
  let stop: (() => void) | undefined;
  const layouts = vi.fn();

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-journey");
    window.sessionStorage.setItem("tt.intro", "1"); // no intro: the modules alone
    gate.waits.length = 0;
    first.mockClear();
    last.mockClear();
    layouts.mockClear();
    window.addEventListener(LAYOUT_EVENT, layouts);
  });
  afterEach(() => {
    stop?.();
    stop = undefined;
    window.removeEventListener(LAYOUT_EVENT, layouts);
    window.sessionStorage.clear();
  });

  it("starts the first module at once, and each next one only after the page has had a turn", async () => {
    stop = startJourney();
    expect(document.documentElement.getAttribute("data-journey")).toBe("on");
    expect(first).toHaveBeenCalledTimes(1);
    expect(last).not.toHaveBeenCalled();
    await release();
    await frames();
    expect(layouts).not.toHaveBeenCalled(); // the layout pass waits for the last module
    expect(window.__ttJourneyStarted).toBe(false); // what the e2e specs wait on (outside production only)
    const turns = 1 + (await releaseAll());
    expect(turns).toBe(MODULES.length - 1);
    expect(last).toHaveBeenCalledTimes(1);
    expect(window.__ttJourneyStarted).toBe(false); // not until the first layout pass and the place restore are done
    await frames();
    expect(window.__ttJourneyStarted).toBe(true);
    await frames();
    expect(layouts).toHaveBeenCalled();
  });

  it("starts nothing more once the journey has ended", async () => {
    stop = startJourney();
    await release();
    stop();
    stop = undefined;
    await releaseAll();
    expect(last).not.toHaveBeenCalled();
    expect(document.documentElement.hasAttribute("data-journey")).toBe(false);
    expect(window.__ttJourneyStarted).toBeUndefined();
  });

  it("rebuilds whole at once on a Motion change mid-start, and the start in flight stops", async () => {
    stop = startJourney();
    await release();
    window.dispatchEvent(new Event(MOTION_EVENT));
    expect(first).toHaveBeenCalledTimes(2);
    expect(last).toHaveBeenCalledTimes(1);
    await releaseAll();
    expect(first).toHaveBeenCalledTimes(2);
    expect(last).toHaveBeenCalledTimes(1);
  });
});
