import { describe, expect, it } from "vitest";
import { arcPath, bezelTicks, digitArcs, groupLabelPoints, polar } from "@/components/landing/journey/geometry/dial";

describe("the dial's geometry", () => {
  it("measures angles clockwise from twelve o'clock", () => {
    const [x0, y0] = polar(100, 0);
    const [x90, y90] = polar(100, 90);
    expect(x0).toBeCloseTo(0);
    expect(y0).toBeCloseTo(-100);
    expect(x90).toBeCloseTo(100);
    expect(y90).toBeCloseTo(0);
  });

  it("draws an arc from one angle to another, the long way round only past 180°", () => {
    expect(arcPath(100, 0, 90)).toBe("M0.00 -100.00 A100 100 0 0 1 100.00 0.00");
    expect(arcPath(100, 0, 270)).toContain(" 0 1 1 ");
  });

  it("lays ten digit segments in groups of 3, 3 and 4 across the sweep", () => {
    const arcs = digitArcs({ start: -60, sweep: 300 });
    expect(arcs).toHaveLength(10);
    expect(arcs.map((a) => a.group)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2, 2]);
    expect(arcs[0]!.from).toBeCloseTo(-60);
    expect(arcs[9]!.to).toBeCloseTo(240);
    const widths = arcs.map((a) => a.to - a.from);
    for (const w of widths) expect(w).toBeCloseTo(widths[0]!);
    expect(arcs[3]!.from - arcs[2]!.to).toBeCloseTo(9);
    expect(arcs[1]!.from - arcs[0]!.to).toBeCloseTo(1.6);
  });

  it("rings the bezel with 120 ticks, every tenth a major one", () => {
    const ticks = bezelTicks();
    expect(ticks).toHaveLength(120);
    expect(ticks.filter((t) => t.major)).toHaveLength(12);
    expect(ticks[0]).toMatchObject({ major: true });
    expect(Math.hypot(ticks[0]!.x1, ticks[0]!.y1)).toBeCloseTo(392);
    expect(Math.hypot(ticks[1]!.x1, ticks[1]!.y1)).toBeCloseTo(400);
    expect(Math.hypot(ticks[1]!.x2, ticks[1]!.y2)).toBeCloseTo(412);
  });

  it("rounds every bezel tick coordinate to two decimals, so the SSR-ed markup never mismatches on hydration", () => {
    for (const tick of bezelTicks()) {
      for (const v of [tick.x1, tick.y1, tick.x2, tick.y2]) {
        expect(Number.isInteger(Math.round(v * 100))).toBe(true);
        expect(v).toBe(Math.round(v * 100) / 100);
      }
    }
  });

  it("puts each group's label at the middle of its own arcs", () => {
    const arcs = digitArcs({ start: -60, sweep: 300 });
    const points = groupLabelPoints(arcs, 326);
    expect(points).toHaveLength(3);
    const [x, y] = polar(326, (arcs[0]!.from + arcs[2]!.to) / 2);
    expect(points[0]![0]).toBeCloseTo(x);
    expect(points[0]![1]).toBeCloseTo(y);
  });
});
