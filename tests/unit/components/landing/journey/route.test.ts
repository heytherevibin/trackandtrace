import { describe, expect, it } from "vitest";
import { routePath, routeSleepers, routeStops } from "@/components/landing/journey/geometry/route";

describe("the route map's geometry", () => {
  const stops = routeStops(7);

  it("places the stops evenly across the drawing, alternating high and low", () => {
    expect(stops[0]).toEqual({ x: 70, y: 46 });
    expect(stops[1]).toEqual({ x: 70 + 1060 / 6, y: 104 });
    expect(stops[6]).toEqual({ x: 1130, y: 46 });
  });

  it("draws a lead-in, one curve per stop after the first, and a lead-out", () => {
    const d = routePath(stops);
    expect(d.startsWith("M20 46 L70 46")).toBe(true);
    expect(d.match(/ C/g)).toHaveLength(6);
    expect(d.endsWith("L1180 46")).toBe(true);
  });

  it("lays sleepers every 14 units along the path, each 12 across it and square to it", () => {
    const sleepers = routeSleepers(stops);
    expect(sleepers.length).toBeGreaterThan(80);
    const mids = sleepers.map((s) => ({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 }));
    for (let i = 1; i < mids.length; i++) {
      expect(Math.hypot(mids[i]!.x - mids[i - 1]!.x, mids[i]!.y - mids[i - 1]!.y)).toBeLessThanOrEqual(14.05);
    }
    for (const s of sleepers) expect(Math.hypot(s.x2 - s.x1, s.y2 - s.y1)).toBeCloseTo(12, 1);
    expect(mids[0]).toEqual({ x: 20, y: 46 });
    expect(Math.abs(sleepers[0]!.x2 - sleepers[0]!.x1)).toBeCloseTo(0);
  });

  it("rounds every sleeper coordinate to two decimals, so the SSR-ed markup never mismatches on hydration", () => {
    for (const sleeper of routeSleepers(stops)) {
      for (const v of [sleeper.x1, sleeper.y1, sleeper.x2, sleeper.y2]) {
        expect(Number.isInteger(Math.round(v * 100))).toBe(true);
        expect(v).toBe(Math.round(v * 100) / 100);
      }
    }
  });
});
