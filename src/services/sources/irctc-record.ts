import type { PnrOutcome, Quota, TicketStatus } from "@/types/domain";

// ---------------------------------------------------------------------------
// Readers for IRCTC reservation data shared by the third-party adapters: loose
// JSON access, IRCTC seat notation, journey dates, and chart state. Pure: no
// I/O and no clock.
// ---------------------------------------------------------------------------

export type Failure = Extract<PnrOutcome, { ok: false }>;
export type Json = Readonly<Record<string, unknown>>;

export function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The first present, non-empty value among the candidate keys. */
export function pick(source: Json, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

export function text(source: Json, keys: readonly string[]): string | undefined {
  const value = pick(source, keys);
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function whole(source: Json, keys: readonly string[]): number | undefined {
  const value = pick(source, keys);
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

// ---- Seat status -----------------------------------------------------------

export interface SeatParse {
  readonly status: Exclude<TicketStatus, "NOT_FOUND">;
  readonly position?: number;
  readonly coach?: string;
  readonly berth?: string;
  /** The quota a waitlist code names: GNWL → GN, PQWL → PQWL. */
  readonly quota?: Quota;
}

const WAITLIST_QUOTA: Readonly<Record<string, Quota>> = {
  GN: "GN",
  WL: "GN",
  PQ: "PQWL",
  RL: "RLWL",
  TQ: "TQWL",
  RS: "RSWL",
  RQ: "RQWL",
  CK: "CKWL",
};

export const COACH = /^[A-Z]{1,2}\d{1,2}$/;

function seatFrom(coach: string, number: string | undefined, code: string | undefined): { coach: string; berth?: string } {
  const berth = [number, code].filter(Boolean).join(" ");
  return berth ? { coach, berth } : { coach };
}

/** IRCTC seat notation: CNF, CNF/B2/41/LB, S5/33/UB, RAC 12, RAC/S4/33/SL, GNWL/45, PQWL 3, CAN. Unknown → null. */
export function parseSeatStatus(raw: string): SeatParse | null {
  const s = raw.trim().toUpperCase();
  if (!s) return null;
  if (s === "CAN" || s === "CANCELLED" || s === "CNL") return { status: "CANCELLED" };

  const waitlist = s.match(/^(GN|PQ|RL|TQ|RS|RQ|CK)?WL[\s/,-]*(\d+)$/);
  if (waitlist) {
    const quota = WAITLIST_QUOTA[waitlist[1] ?? "WL"];
    const position = Number(waitlist[2]);
    return waitlist[1] && quota ? { status: "WL", position, quota } : { status: "WL", position };
  }

  const tokens = s.split(/[\s/,-]+/).filter(Boolean);
  const [head, ...rest] = tokens;
  if (head === "RAC") {
    if (rest.length === 1 && /^\d+$/.test(rest[0]!)) return { status: "RAC", position: Number(rest[0]) };
    if (rest.length === 0) return null;
    if (COACH.test(rest[0]!) && (rest[1] === undefined || /^\d+$/.test(rest[1]))) return { status: "RAC", ...seatFrom(rest[0]!, rest[1], rest[2]) };
    return null;
  }
  const racJoined = s.match(/^RAC(\d+)$/);
  if (racJoined) return { status: "RAC", position: Number(racJoined[1]) };

  if (head === "CNF") {
    if (rest.length === 0) return { status: "CNF" };
    if (COACH.test(rest[0]!) && (rest[1] === undefined || /^\d+$/.test(rest[1]))) return { status: "CNF", ...seatFrom(rest[0]!, rest[1], rest[2]) };
    return null;
  }
  if (head && COACH.test(head) && rest[0] && /^\d+$/.test(rest[0])) return { status: "CNF", ...seatFrom(head, rest[0], rest[1]) };
  return null;
}

// ---- Dates -----------------------------------------------------------------

const MONTHS: Readonly<Record<string, number>> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

function isoDate(year: number, month: number, day: number): string | null {
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 25-09-2026 · 25/09/2026 · 2026-09-25 · Sep 25, 2026 … · 25 Sep 2026 → 2026-09-25. Anything else → null. */
export function parseJourneyDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return isoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (m) {
    const month = MONTHS[m[1]!.toUpperCase()];
    return month ? isoDate(Number(m[3]), month, Number(m[2])) : null;
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*,?\s+(\d{4})\b/);
  if (m) {
    const month = MONTHS[m[2]!.toUpperCase()];
    return month ? isoDate(Number(m[3]), month, Number(m[1])) : null;
  }
  return null;
}

/** The clock time inside a timestamp such as "22 Aug 2026, 04:35:00 pm" or "16:35", as 24-hour HH:MM. */
export function parseClockTime(raw: string): string | null {
  const m = raw.trim().match(/(?:^|[\s,T])(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3]?.toLowerCase().replace(/\./g, "");
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === "pm" ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export const journeyLabelFormat = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });

/** "Chart Prepared" → true, "Chart Not Prepared" → false, booleans as sent; anything else → undefined. */
export function chartPreparedFrom(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const t = value.toLowerCase();
    if (t.includes("not prepared")) return false;
    if (t.includes("prepared")) return true;
  }
  return undefined;
}

// Refusals that mean the PNR has no record (never booked, flushed, not yet generated). Each needs the
// PNR or the record in view: a bare "invalid" (an invalid date, an invalid key) is not a missing record.
// Gaps span one line, periods included ("PNR No. is not valid").
const NO_RECORD: readonly RegExp[] = [
  /\bno pnr data\b/i,
  /\b(?:invalid|not valid|wrong)\b.{0,20}\bpnr\b/i,
  /\bpnr\b.{0,40}\b(?:not found|invalid|not valid|does not exist|flushed|not yet generated|not generated)\b/i,
  /\bflushed\b/i,
  /\bnot yet generated\b/i,
  /\bno (?:reservation )?records? found\b/i,
];

/** A provider's refusal message that means the PNR has no record. */
export function isNoRecordMessage(message: string): boolean {
  return NO_RECORD.some((pattern) => pattern.test(message));
}
