import { describe, expect, it } from "vitest";
import { entranceStep, phaseAfter, type EntrancePhase } from "@/components/landing/journey/entrances";

const VH = 800;
const box = (top: number, height = 400) => ({ top, bottom: top + height });

/** Walks one entrance through a run of boxes, as the watcher does, and says which steps it took. */
function walk(tops: readonly number[], once: boolean, from: EntrancePhase = "rest") {
  return tops.reduce<{ readonly steps: readonly string[]; readonly phase: EntrancePhase }>(
    ({ steps, phase }, top) => {
      const step = entranceStep(phase, box(top), VH, 0.88, once);
      return step ? { steps: [...steps, step], phase: phaseAfter(step, once) } : { steps, phase };
    },
    { steps: [], phase: from },
  );
}

describe("entranceStep: a replaying entrance (the berth plan)", () => {
  it("leaves a trigger at rest while any of it is in the window", () => {
    expect(entranceStep("rest", box(100), VH, 0.88)).toBeNull();
    expect(entranceStep("rest", box(-399), VH, 0.88)).toBeNull();
    expect(entranceStep("rest", box(799), VH, 0.88)).toBeNull();
  });

  it("arms a trigger only once it has wholly left the window, above or below", () => {
    expect(entranceStep("rest", box(-400), VH, 0.88)).toBe("arm");
    expect(entranceStep("rest", box(800), VH, 0.88)).toBe("arm");
  });

  it("plays an armed trigger when it comes into the band from below", () => {
    expect(entranceStep("armed", box(720), VH, 0.88)).toBeNull();
    expect(entranceStep("armed", box(700), VH, 0.88)).toBe("play");
  });

  it("plays an armed trigger when it comes back from above", () => {
    expect(entranceStep("armed", box(-330), VH, 0.88)).toBeNull();
    expect(entranceStep("armed", box(-300), VH, 0.88)).toBe("play");
  });

  it("keeps an armed trigger armed while it is still out of sight", () => {
    expect(entranceStep("armed", box(-2000), VH, 0.88)).toBeNull();
    expect(entranceStep("armed", box(3000), VH, 0.88)).toBeNull();
  });

  it("goes back to rest after it plays, so it plays again each time it comes back", () => {
    expect(walk([2000, 300, 2000, 300], false)).toEqual({ steps: ["arm", "play", "arm", "play"], phase: "rest" });
  });
});

describe("entranceStep: a section entrance, once per load (the owner, 2026-09-30)", () => {
  it("goes rest → armed → play → played, and a played entrance never arms again", () => {
    expect(walk([2000, 300], true)).toEqual({ steps: ["arm", "play"], phase: "played" });
    expect(walk([2000, 300, 2000, 300, -2000, -300], true)).toEqual({ steps: ["arm", "play"], phase: "played" });
    for (const top of [-2000, -300, 300, 3000]) expect(entranceStep("played", box(top), VH, 0.88, true)).toBeNull();
  });

  it("never plays a trigger that was in the window when the journey started: it counts as seen, as the server drew it", () => {
    expect(entranceStep("rest", box(100), VH, 0.88, true)).toBe("seen");
    expect(entranceStep("rest", box(799), VH, 0.88, true)).toBe("seen");
    expect(walk([100, 2000, 300, -2000, -300], true)).toEqual({ steps: ["seen"], phase: "played" });
  });

  it("still plays, when first seen, a trigger the reader jumped past without it entering the band", () => {
    // out of sight below at start, then a jump lands the reader past it (above the window), then they scroll up
    expect(walk([2000, -2000, -1000, -300], true)).toEqual({ steps: ["arm", "play"], phase: "played" });
  });

  it("plays from either side, the first time it enters the band", () => {
    expect(walk([-2000, -300], true)).toEqual({ steps: ["arm", "play"], phase: "played" });
    expect(walk([3000, 700], true)).toEqual({ steps: ["arm", "play"], phase: "played" });
  });
});
