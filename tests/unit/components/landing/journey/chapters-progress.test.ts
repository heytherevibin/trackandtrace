import { describe, expect, it } from "vitest";
import { barWidth, chapterAt, stepLit, typedCount } from "@/components/landing/journey/chapters-progress";

describe("the chapters' progress", () => {
  it("splits the scroll into three equal stops", () => {
    expect(chapterAt(0)).toEqual({ i: 0, t: 0 });
    expect(chapterAt(0.5)).toEqual({ i: 1, t: 0.5 });
    expect(chapterAt(1)).toEqual({ i: 2, t: 1 });
  });
  it("types the ten digits over the first four fifths of stop 01", () => {
    expect([0, 0.4, 0.8, 1].map(typedCount)).toEqual([0, 5, 10, 10]);
  });
  it("draws the request bars as v3 does", () => {
    expect(barWidth(8, 0)).toBeCloseTo(230.5, 1);
    expect(barWidth(0, 0)).toBeCloseTo(11.8, 1);
  });
  it("lights each step dot as the pulse reaches it", () => {
    expect([stepLit(0, 0), stepLit(1, 0.47), stepLit(1, 0.49), stepLit(2, 0.98)]).toEqual([true, false, true, true]);
  });
});
