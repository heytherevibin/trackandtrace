import { type Tick, polar, round2 } from "./dial";

// The station clock's geometry, from prototype v3's clock.js: a face 200 drawing units across, centred on 0,0.

export interface IstTime {
  readonly h: number;
  readonly m: number;
}

const IST = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

/** The hour (0–23) and minute in India at this instant. */
export function istTime(now: Date): IstTime {
  const parts = Object.fromEntries(IST.formatToParts(now).map((part) => [part.type, part.value]));
  return { h: Number(parts.hour) % 24, m: Number(parts.minute) };
}

/** Hand angles in degrees clockwise from twelve: the hour hand moves on through its hour. */
export function handAngles({ h, m }: IstTime): { readonly hour: number; readonly minute: number } {
  return { hour: ((h % 12) + m / 60) * 30, minute: m * 6 };
}

/** Sixty minute marks, every fifth a longer hour mark. */
export function clockTicks(): readonly Tick[] {
  return Array.from({ length: 60 }, (_, i) => {
    const major = i % 5 === 0;
    const [x1, y1] = polar(major ? 76 : 82, i * 6);
    const [x2, y2] = polar(88, i * 6);
    return { x1: round2(x1), y1: round2(y1), x2: round2(x2), y2: round2(y2), major };
  });
}

/** The second hand's angle, sweeping: 6° a second, through the milliseconds. IST is a whole number of minutes
 * from UTC, so the seconds are the same. */
export function secondAngle(now: Date): number {
  return round2((now.getUTCSeconds() + now.getUTCMilliseconds() / 1000) * 6);
}
