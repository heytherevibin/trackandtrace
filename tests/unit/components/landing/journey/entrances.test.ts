import { describe, expect, it } from "vitest";
import { entranceStep, inBand, phaseAfter, visible, type EntrancePhase } from "@/components/landing/journey/entrances";

// Every entrance plays once per load (the owner, 2026-09-30): the section entrances and the berth plan. Visible when
// the journey starts, it plays right then, like the headline; out of sight, it plays the first time it enters the band.
// The band at 0.88 in an 800 px window runs from 96 to 704 px.
const VH = 800;
const AT = 0.88;
const box = (top: number, height = 400) => ({ top, bottom: top + height });

/** Walks one entrance through a run of boxes, as the watcher does, and says which steps it took. */
function walk(boxes: readonly { top: number; bottom: number }[], from: EntrancePhase = "rest") {
  return boxes.reduce<{ readonly steps: readonly string[]; readonly phase: EntrancePhase }>(
    ({ steps, phase }, b) => {
      const step = entranceStep(phase, b, VH, AT);
      return step ? { steps: [...steps, step], phase: phaseAfter(step) } : { steps, phase };
    },
    { steps: [], phase: from },
  );
}
const tops = (...ts: readonly number[]) => ts.map((t) => box(t));

describe("visible and inBand", () => {
  it("counts any part of a trigger in the window as visible, and none as not", () => {
    expect(visible(box(799), VH)).toBe(true);
    expect(visible(box(-399), VH)).toBe(true);
    expect(visible(box(800), VH)).toBe(false);
    expect(visible(box(-400), VH)).toBe(false);
  });

  it("counts a trigger as in the band once any of it has come into the band, from either side", () => {
    expect(inBand(box(703), VH, AT)).toBe(true);
    expect(inBand(box(704), VH, AT)).toBe(false);
    expect(inBand(box(-303), VH, AT)).toBe(true);
    expect(inBand(box(-304), VH, AT)).toBe(false);
  });
});

describe("entranceStep: once per load", () => {
  it("plays a trigger visible when the journey starts right then, once, however little of it shows", () => {
    for (const top of [100, 799, -399]) expect(entranceStep("rest", box(top), VH, AT)).toBe("start");
    expect(walk(tops(100, 2000, 300, -2000, -300))).toEqual({ steps: ["start"], phase: "played" });
  });

  it("plays the departure board peeking in at a desktop window's foot at load, at load", () => {
    // the board's box at load (measured): 609–1042 px of 800, 637–1070 px of 900; its band is 0.9
    expect(entranceStep("rest", { top: 609, bottom: 1042 }, 800, 0.9)).toBe("start");
    expect(entranceStep("rest", { top: 637, bottom: 1070 }, 900, 0.9)).toBe("start");
  });

  it("goes rest → armed → play → played for a trigger out of sight at start, and a played one never arms again", () => {
    expect(walk(tops(2000, 300))).toEqual({ steps: ["arm", "play"], phase: "played" });
    expect(walk(tops(2000, 300, 2000, 300, -2000, -300))).toEqual({ steps: ["arm", "play"], phase: "played" });
    for (const top of [-2000, -300, 300, 3000]) expect(entranceStep("played", box(top), VH, AT)).toBeNull();
  });

  it("keeps an armed trigger armed until it enters the band", () => {
    for (const top of [-2000, -320, 720, 3000]) expect(entranceStep("armed", box(top), VH, AT)).toBeNull();
  });

  it("still plays, when first seen, a trigger the reader jumped past without it entering the band", () => {
    // out of sight below at start, then a jump lands the reader past it (above the window), then they scroll up
    expect(walk(tops(2000, -2000, -1000, -300))).toEqual({ steps: ["arm", "play"], phase: "played" });
  });

  it("plays from either side, the first time it enters the band", () => {
    expect(walk(tops(-2000, -300))).toEqual({ steps: ["arm", "play"], phase: "played" });
    expect(walk(tops(3000, 700))).toEqual({ steps: ["arm", "play"], phase: "played" });
  });
});
