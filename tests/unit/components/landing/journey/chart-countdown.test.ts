import { describe, expect, it } from "vitest";
import { chartFace, dayTicks, istMinutes } from "@/components/landing/journey/chart-countdown";

const ist = (hhmm: string, day = "2026-09-17") => new Date(`${day}T${hhmm}:00+05:30`);

describe("the 24-hour chart face", () => {
  it("reads minutes past midnight in IST", () => {
    expect(istMinutes(ist("00:00"))).toBe(0);
    expect(istMinutes(ist("15:12"))).toBe(912);
  });

  it("sweeps from now to the chart time, ahead", () => {
    const face = chartFace(ist("15:12").toISOString(), ist("12:00"));
    expect(face).toMatchObject({ ahead: true, hours: 3, minutes: 12, nowDeg: 180, chartDeg: 228 });
    expect(face.arc).toMatch(/^M/);
    expect(face.mark[0]).toBeCloseTo(352 * Math.sin((228 * Math.PI) / 180), 1);
  });

  it("sweeps forward through midnight", () => {
    const face = chartFace(ist("00:15", "2026-09-18").toISOString(), ist("23:50"));
    expect(face.ahead).toBe(true);
    expect(face.hours * 60 + face.minutes).toBe(25);
    expect(face.chartDeg).toBeCloseTo(3.75);
  });

  it("draws no arc once the chart time has passed", () => {
    const face = chartFace(ist("09:00").toISOString(), ist("12:00"));
    expect(face.ahead).toBe(false);
    expect(face.arc).toBe("");
  });

  it("marks 24 hours, every sixth a major one", () => {
    const ticks = dayTicks();
    expect(ticks).toHaveLength(24);
    expect(ticks.filter((t) => t.major)).toHaveLength(4);
  });
});
