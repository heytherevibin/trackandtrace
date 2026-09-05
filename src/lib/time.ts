// IST-correct clock helpers. All journey/chart times are railway time (IST).

export const IST = "Asia/Kolkata";

export function istParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return parts;
}

export function toIstMs(d: Date): number {
  // Millisecond instant of the same wall-clock reading in IST.
  const p = istParts(d);
  const y = Number(p.year);
  const mo = Number(p.month);
  const da = Number(p.day);
  const h = Number(p.hour) % 24;
  const mi = Number(p.minute);
  const s = Number(p.second);
  return Date.UTC(y, mo - 1, da, h, mi, s);
}

/** Build an IST Date from local Date, interpreted as IST wall time. */
export function istFromWall(y: number, mo1: number, day: number, h: number, mi: number): Date {
  // Date.UTC of the wall time, then shift to the UTC instant whose IST wall
  // reading equals it (approximation stable across the year for our purposes
  // because IST has no DST).
  const asUtc = Date.UTC(y, mo1 - 1, day, h, mi);
  return new Date(asUtc - (5.5 * 60 + 30) * 60_000);
}

export function istNow(): Date {
  return new Date();
}

export function istDateKey(d: Date): string {
  const p = istParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

export function fmtTimeIST(d: Date): string {
  const p = istParts(d);
  return `${p.hour}:${p.minute}`;
}

export function fmtDayShort(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(d);
}

/** Add days to an IST wall date. */
export function addDaysIST(d: Date, days: number): Date {
  const p = istParts(d);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + days);
  return new Date(asUtc - (5.5 * 60 + 30) * 60_000);
}

export function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 3_600_000;
}

export function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60_000;
}

/** "HH:MM:SS" ticking countdown between now and target. */
export function countdownParts(now: Date, target: Date) {
  let ms = Math.max(0, target.getTime() - now.getTime());
  const h = Math.floor(ms / 3_600_000);
  ms -= h * 3_600_000;
  const m = Math.floor(ms / 60_000);
  ms -= m * 60_000;
  const s = Math.floor(ms / 1000);
  return { h, m, s, done: target.getTime() - now.getTime() <= 0 };
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** IST weekday as a Date's IST weekday number (0 Sun … 6 Sat). */
export function istWeekday(d: Date): number {
  const p = istParts(d);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  return new Date(asUtc).getUTCDay();
}
