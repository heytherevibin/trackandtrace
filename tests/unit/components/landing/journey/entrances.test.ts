import { describe, expect, it } from "vitest";
import { entranceStep, inBand, phaseAfter, type EntrancePhase } from "@/components/landing/journey/entrances";

// Every entrance plays once per load (the owner, 2026-09-30): the section entrances and, since the review, the berth
// plan too. The band at 0.88 in an 800 px window runs from 96 to 704 px (608 px tall).
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

describe("inBand: a trigger properly in the band, not merely peeking at the window's edge", () => {
  it("holds a trigger with at least half of itself in the band", () => {
    expect(inBand(box(100), VH, AT)).toBe(true);
    expect(inBand(box(504), VH, AT)).toBe(true); // 200 of its 400 px are in the band
    expect(inBand(box(-104), VH, AT)).toBe(true); // 200 px in, from above
  });

  it("does not hold one that only peeks in, from below or above, nor one out of sight", () => {
    expect(inBand(box(520), VH, AT)).toBe(false); // 184 px in: in the window, overlapping the band, still peeking
    expect(inBand(box(-120), VH, AT)).toBe(false);
    expect(inBand(box(750), VH, AT)).toBe(false); // in the window, below the band
    expect(inBand(box(3000), VH, AT)).toBe(false);
  });

  it("holds a trigger taller than the band once half the band is its", () => {
    expect(inBand(box(400, 3000), VH, AT)).toBe(true); // 304 px: half the band
    expect(inBand(box(420, 3000), VH, AT)).toBe(false);
    expect(inBand(box(-2000, 3000), VH, AT)).toBe(true); // covers the band
  });

  it("holds the departure board at 1280×800 and 1440×900 loaded at the top as peeking", () => {
    // the board's box at load (measured): 609–1042 px of 800, 637–1070 px of 900; its band is 0.9
    expect(inBand({ top: 609, bottom: 1042 }, 800, 0.9)).toBe(false);
    expect(inBand({ top: 637, bottom: 1070 }, 900, 0.9)).toBe(false);
    // scrolled to (the section's top under the window's): properly in
    expect(inBand({ top: 8, bottom: 441 }, 800, 0.9)).toBe(true);
  });

  it("never loses an empty trigger inside the band", () => {
    expect(inBand(box(300, 0), VH, AT)).toBe(true);
  });
});

describe("entranceStep: once per load", () => {
  it("goes rest → armed → play → played, and a played entrance never arms again", () => {
    expect(walk(tops(2000, 300))).toEqual({ steps: ["arm", "play"], phase: "played" });
    expect(walk(tops(2000, 300, 2000, 300, -2000, -300))).toEqual({ steps: ["arm", "play"], phase: "played" });
    for (const top of [-2000, -300, 300, 3000]) expect(entranceStep("played", box(top), VH, AT)).toBeNull();
  });

  it("never plays a trigger properly in the band when the journey starts: it counts as seen, as the server drew it", () => {
    expect(entranceStep("rest", box(100), VH, AT)).toBe("seen");
    expect(walk(tops(100, 2000, 300, -2000, -300))).toEqual({ steps: ["seen"], phase: "played" });
  });

  it("arms a trigger that only peeks in at start, and plays it once it is properly in the band", () => {
    expect(entranceStep("rest", box(650), VH, AT)).toBe("arm");
    expect(walk(tops(650, 600, 300))).toEqual({ steps: ["arm", "play"], phase: "played" });
  });

  it("keeps an armed trigger armed while it only peeks, or is out of sight", () => {
    for (const top of [-2000, -150, 560, 3000]) expect(entranceStep("armed", box(top), VH, AT)).toBeNull();
  });

  it("still plays, when first seen, a trigger the reader jumped past without it entering the band", () => {
    // out of sight below at start, then a jump lands the reader past it (above the window), then they scroll up
    expect(walk(tops(2000, -2000, -1000, -150, -50))).toEqual({ steps: ["arm", "play"], phase: "played" });
  });

  it("plays from either side, the first time it is properly in the band", () => {
    expect(walk(tops(-2000, -50))).toEqual({ steps: ["arm", "play"], phase: "played" });
    expect(walk(tops(3000, 400))).toEqual({ steps: ["arm", "play"], phase: "played" });
  });
});
