import { describe, expect, it } from "vitest";
import { clockTicks, handAngles, istTime } from "@/components/landing/journey/geometry/clock";

describe("the station clock's geometry", () => {
  it("reads the time in India, whatever the machine's zone", () => {
    expect(istTime(new Date("2026-09-17T06:30:00.000Z"))).toEqual({ h: 12, m: 0 });
    expect(istTime(new Date("2026-09-17T18:45:00.000Z"))).toEqual({ h: 0, m: 15 });
  });

  it("turns the hour hand 30° an hour plus half a degree a minute, and the minute hand 6° a minute", () => {
    expect(handAngles({ h: 3, m: 0 })).toEqual({ hour: 90, minute: 0 });
    expect(handAngles({ h: 15, m: 30 })).toEqual({ hour: 105, minute: 180 });
    expect(handAngles({ h: 12, m: 0 })).toEqual({ hour: 0, minute: 0 });
  });

  it("marks sixty minutes around the face, every fifth a longer hour mark", () => {
    const ticks = clockTicks();
    expect(ticks).toHaveLength(60);
    expect(ticks.filter((t) => t.major)).toHaveLength(12);
    expect(Math.hypot(ticks[0]!.x1, ticks[0]!.y1)).toBeCloseTo(76);
    expect(Math.hypot(ticks[1]!.x1, ticks[1]!.y1)).toBeCloseTo(82);
    expect(Math.hypot(ticks[1]!.x2, ticks[1]!.y2)).toBeCloseTo(88);
  });

  it("rounds every tick coordinate to two decimals, so the SSR-ed markup never mismatches on hydration", () => {
    for (const tick of clockTicks()) {
      for (const v of [tick.x1, tick.y1, tick.x2, tick.y2]) {
        expect(Number.isInteger(Math.round(v * 100))).toBe(true);
        expect(v).toBe(Math.round(v * 100) / 100);
      }
    }
  });
});
