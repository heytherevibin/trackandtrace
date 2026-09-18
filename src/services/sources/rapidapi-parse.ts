import type { BookingClass, PassengerSeat, PnrOutcome, PnrResult, Quota, TicketStatus } from "@/types/domain";
import { bookingClassSchema, quotaSchema } from "@/types/schemas";

// ---------------------------------------------------------------------------
// Reads the RapidAPI "IRCTC" (IRCTCAPI, irctc1.p.rapidapi.com) PNR response into
// the domain record. Pure: no I/O, no clock beyond the `now` passed in.
//
// The provider publishes no schema, so both shapes seen in the wild are read:
// PascalCase (Pnr, TrainNo, PassengerStatus[].CurrentStatus) and camelCase
// (pnrNumber, trainNumber, passengerList[].currentStatus). Every field this
// product renders is validated; anything unreadable fails closed. The
// provider's predictions (Prediction, PredictionPercentage, ConfirmTktStatus)
// and passenger names are never read.
// ---------------------------------------------------------------------------

type Failure = Extract<PnrOutcome, { ok: false }>;
export type Irctc1Parse = { readonly ok: true; readonly result: PnrResult } | Failure;

export interface SeatParse {
  readonly status: Exclude<TicketStatus, "NOT_FOUND">;
  readonly position?: number;
  readonly coach?: string;
  readonly berth?: string;
  /** The quota a waitlist code names: GNWL → GN, PQWL → PQWL. */
  readonly quota?: Quota;
}

const UNREADABLE = "The third-party provider returned a record this product cannot read. Nothing was shown in its place.";

function unavailable(message: string = UNREADABLE): Failure {
  return { ok: false, code: "SOURCE_UNAVAILABLE", message };
}

type Json = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The first present, non-empty value among the candidate keys. */
function pick(source: Json, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function text(source: Json, keys: readonly string[]): string | undefined {
  const value = pick(source, keys);
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function whole(source: Json, keys: readonly string[]): number | undefined {
  const value = pick(source, keys);
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

// ---- Seat status -----------------------------------------------------------

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

const COACH = /^[A-Z]{1,2}\d{1,2}$/;

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

const journeyLabelFormat = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });

// ---- Record ----------------------------------------------------------------

const K = {
  pnr: ["Pnr", "pnr", "pnrNumber", "PnrNumber"],
  trainNo: ["TrainNo", "trainNumber", "TrainNumber", "trainNo"],
  trainName: ["TrainName", "trainName"],
  doj: ["Doj", "dateOfJourney", "DateOfJourney", "SourceDoj", "sourceDoj"],
  from: ["From", "BoardingPoint", "sourceStation", "boardingPoint", "from"],
  to: ["To", "ReservationUpto", "destinationStation", "reservationUpto", "to"],
  fromName: ["BoardingStationName", "boardingStationName", "FromName", "sourceStationName"],
  toName: ["ReservationUptoName", "reservationUptoName", "ToName", "destinationStationName"],
  cls: ["Class", "journeyClass", "class", "JourneyClass"],
  quota: ["Quota", "quota", "bookingQuota"],
  chart: ["ChartPrepared", "chartPrepared", "chartStatus", "ChartStatus"],
  departs: ["DepartureTime", "departureTime"],
  distance: ["Distance", "distance"],
  count: ["PassengerCount", "numberOfpassenger", "passengerCount"],
  passengers: ["PassengerStatus", "passengerList", "passengers", "PassengerList"],
  paxNumber: ["Number", "passengerSerialNumber", "SerialNumber"],
  booking: ["BookingStatus", "bookingStatus"],
  current: ["CurrentStatus", "currentStatus"],
  coach: ["CurrentCoachId", "currentCoachId"],
  berthNo: ["CurrentBerthNo", "currentBerthNo"],
  berthCode: ["CurrentBerthCode", "currentBerthCode"],
} as const;

function chartPrepared(record: Json): boolean | undefined {
  const value = pick(record, K.chart);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const t = value.toLowerCase();
    if (t.includes("not prepared")) return false;
    if (t.includes("prepared")) return true;
  }
  return undefined;
}

function refusalCode(message: string): Failure["code"] {
  return /not valid|invalid|flushed|not yet generated|not generated|no record|not found/i.test(message) ? "NOT_FOUND" : "SOURCE_UNAVAILABLE";
}

function passengerFrom(raw: unknown, fallbackIndex: number, quota: Quota): PassengerSeat | null {
  if (!isRecord(raw)) return null;
  const bookingRaw = text(raw, K.booking);
  const currentRaw = text(raw, K.current);
  const booking = bookingRaw ? parseSeatStatus(bookingRaw) : null;
  const current = currentRaw ? parseSeatStatus(currentRaw) : null;
  if (!booking || !current) return null;

  // Coach and berth sometimes travel in their own fields rather than in the status string.
  const coach = current.coach ?? text(raw, K.coach);
  const berthNo = text(raw, K.berthNo);
  const berth = current.berth ?? (berthNo && berthNo !== "0" ? [berthNo, text(raw, K.berthCode)].filter(Boolean).join(" ") : undefined);
  const index = whole(raw, K.paxNumber) ?? fallbackIndex;

  return {
    index: index > 0 ? index : fallbackIndex,
    bookingStatus: booking.status,
    currentStatus: current.status,
    ...(current.position !== undefined ? { position: current.position } : {}),
    ...(current.status !== "CANCELLED" && coach ? { coach } : {}),
    ...(current.status !== "CANCELLED" && coach && berth ? { berth } : {}),
    quota: current.quota ?? booking.quota ?? quota,
  };
}

export function parseIrctc1Response(body: unknown, pnr: string, now: Date): Irctc1Parse {
  if (!isRecord(body)) return unavailable();
  if (body.status === false) {
    const message = typeof body.message === "string" ? body.message : "";
    return refusalCode(message) === "NOT_FOUND"
      ? { ok: false, code: "NOT_FOUND", message: "The third-party provider has no reservation record for this PNR." }
      : unavailable("The third-party provider could not answer for this PNR. Nothing was shown in its place.");
  }

  const nested = body.data;
  const record = Array.isArray(nested) ? nested[0] : nested;
  if (!isRecord(record)) return unavailable();

  const returnedPnr = text(record, K.pnr);
  if (returnedPnr && returnedPnr !== pnr) return unavailable();

  const number = text(record, K.trainNo);
  if (!number || !/^\d{5}$/.test(number)) return unavailable();

  const dojRaw = text(record, K.doj);
  const journeyDate = dojRaw ? parseJourneyDate(dojRaw) : null;
  if (!journeyDate) return unavailable();

  const from = text(record, K.from)?.toUpperCase();
  const to = text(record, K.to)?.toUpperCase();
  if (!from || !to || !/^[A-Z]{2,5}$/.test(from) || !/^[A-Z]{2,5}$/.test(to)) return unavailable();

  const clsParse = bookingClassSchema.safeParse(text(record, K.cls)?.toUpperCase());
  if (!clsParse.success) return unavailable();
  const cls: BookingClass = clsParse.data;

  const passengersRaw = pick(record, K.passengers);
  if (!Array.isArray(passengersRaw) || passengersRaw.length === 0) return unavailable();

  const quotaRaw = text(record, K.quota)?.toUpperCase();
  const quotaParse = quotaSchema.safeParse(quotaRaw);
  const firstSeat = passengersRaw.length > 0 && isRecord(passengersRaw[0]) ? parseSeatStatus(text(passengersRaw[0], K.booking) ?? "") : null;
  const recordQuota: Quota | undefined = quotaParse.success ? quotaParse.data : firstSeat?.quota;
  if (!recordQuota) return unavailable();

  const pax: PassengerSeat[] = [];
  for (const [i, raw] of passengersRaw.entries()) {
    const seat = passengerFrom(raw, i + 1, recordQuota);
    if (!seat) return unavailable();
    pax.push(seat);
  }
  const lead = pax[0]!;

  const departs = text(record, K.departs);
  const fromName = text(record, K.fromName);
  const toName = text(record, K.toName);
  const distance = whole(record, K.distance);
  const chart = chartPrepared(record);

  const result: PnrResult = {
    snapshot: {
      pnr,
      train: {
        number,
        ...(text(record, K.trainName) ? { name: text(record, K.trainName) } : {}),
        from: fromName ? { code: from, city: fromName } : { code: from },
        to: toName ? { code: to, city: toName } : { code: to },
        ...(departs && /^\d{2}:\d{2}$/.test(departs) ? { depTime: departs } : {}),
        ...(distance !== undefined && distance > 0 ? { distanceKm: distance } : {}),
      },
      cls,
      journeyDate,
      journeyDateLabel: journeyLabelFormat.format(new Date(`${journeyDate}T12:00:00+05:30`)),
      ...(chart !== undefined ? { chartPrepared: chart } : {}),
      passengerCount: whole(record, K.count) ?? pax.length,
      pax,
      source: "rapidapi",
    },
    lead: {
      status: lead.currentStatus,
      position: lead.position ?? null,
      ...(lead.coach ? { coach: lead.coach } : {}),
      ...(lead.berth ? { berth: lead.berth } : {}),
      quota: recordQuota,
    },
    checkedAt: now.toISOString(),
  };
  return { ok: true, result };
}
