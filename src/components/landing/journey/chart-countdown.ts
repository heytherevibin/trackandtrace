import { countdownTo } from "@/utils/datetime";
import { arcPath, polar, round2, type Point, type Tick } from "./geometry/dial";

// The hero dial's 24-hour face after a result (spec §3.A, Hero): an arc from now to the chart time the record
// itself shows (the source's chartAt; never computed here), on an IST clock face. Pure.

const DAY = 1440;
const RING = 352;

export function istMinutes(at: Date): number {
  return (at.getUTCHours() * 60 + at.getUTCMinutes() + 330 + at.getUTCSeconds() / 60) % DAY;
}

export interface ChartFace {
  readonly ahead: boolean;
  readonly hours: number;
  readonly minutes: number;
  readonly nowDeg: number;
  readonly chartDeg: number;
  /** The arc from now to the chart time, or "" once it has passed. */
  readonly arc: string;
  readonly mark: Point;
}

export function chartFace(chartAt: string, now: Date): ChartFace {
  const at = new Date(chartAt);
  const left = countdownTo(at, now);
  const nowDeg = (istMinutes(now) / DAY) * 360;
  const chartDeg = (istMinutes(at) / DAY) * 360;
  const raw = chartDeg - nowDeg;
  const sweep = raw <= 0 ? raw + 360 : raw;
  const ahead = left.state === "ahead";
  const [x, y] = polar(RING, chartDeg);
  return {
    ahead,
    hours: left.hours,
    minutes: left.minutes,
    nowDeg,
    chartDeg,
    arc: ahead ? arcPath(RING, nowDeg, nowDeg + Math.min(sweep, 359.5)) : "",
    mark: [round2(x), round2(y)],
  };
}

/** The face's hour marks: 24, every sixth longer. */
export function dayTicks(): readonly Tick[] {
  return Array.from({ length: 24 }, (_, h) => {
    const major = h % 6 === 0;
    const [x1, y1] = polar(major ? 338 : 344, h * 15);
    const [x2, y2] = polar(360, h * 15);
    return { x1: round2(x1), y1: round2(y1), x2: round2(x2), y2: round2(y2), major };
  });
}
