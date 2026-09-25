import { describe, expect, it } from "vitest";
import { leanStep, odometer, stationTops, stripFraction, stripPlace, trainLeft } from "@/components/landing/journey/strip-position";

describe("the strip's position", () => {
  it("starts at 0, sets each station a third of a window early, and always rises", () => {
    expect(stationTops([0, 900, 1800, 1700], 300)).toEqual([0, 600, 1500, 1501]);
  });

  it("finds the station and how far towards the next", () => {
    const tops = [0, 600, 1500];
    expect(stripPlace(tops, 0)).toEqual({ i: 0, f: 0 });
    expect(stripPlace(tops, 300)).toEqual({ i: 0, f: 0.5 });
    expect(stripPlace(tops, 600)).toEqual({ i: 1, f: 0 });
    expect(stripPlace(tops, 9_000)).toEqual({ i: 2, f: 0 });
  });

  it("maps a place to the strip's fraction and the odometer's kilometre", () => {
    expect(stripFraction({ i: 1, f: 0.5 }, 5)).toBe(0.375);
    expect(odometer({ i: 0, f: 0.5 }, [0, 64, 138])).toBe(32);
    expect(odometer({ i: 2, f: 0 }, [0, 64, 138])).toBe(138);
  });

  it("leans against the scroll, never past 10°, and comes back upright when it stops", () => {
    expect(leanStep(0, 100)).toBeCloseTo(-1.8);
    const hard = Array.from({ length: 60 }).reduce<number>((lean) => leanStep(lean, 400), 0);
    expect(hard).toBeGreaterThanOrEqual(-10);
    const settled = Array.from({ length: 120 }).reduce<number>((lean) => leanStep(lean, 0), -9);
    expect(settled).toBe(0);
  });

  it("holds the train inside a 390px rail: a 22px glyph's left edge sits at 0% at fraction 0, its right edge at 100% at fraction 1", () => {
    const [glyphWidth, trackWidth] = [22, 390];
    const halfPercent = (glyphWidth / 2 / trackWidth) * 100;
    expect(trainLeft(0, glyphWidth, trackWidth) - halfPercent).toBeCloseTo(0);
    expect(trainLeft(1, glyphWidth, trackWidth) + halfPercent).toBeCloseTo(100);
  });

  it("centres the train on an unclamped mid fraction", () => {
    expect(trainLeft(0.5, 22, 390)).toBe(50);
  });

  it("skips the clamp when the track has not been measured yet (trackWidth <= 0)", () => {
    expect(trainLeft(0.3, 22, 0)).toBe(30);
    expect(trainLeft(0.3, 22, -5)).toBe(30);
  });
});
