import type { PnrDataSource } from "@/services/pnr-source";
import type { BookingClass, PassengerSeat, PnrOutcome, Quota, TicketStatus } from "@/types/domain";
import { PNR_INVALID_MESSAGE, isValidPnr } from "@/utils/pnr";
import { FIXTURE_CLASSES, FIXTURE_TRAINS, type FixtureTrain } from "./fixture-data";

// ---------------------------------------------------------------------------
// Deterministic, clearly labelled sample source for development and tests.
// Every field derives from the PNR digits, so a given PNR always tells the
// same story. Never registered in production (see sources/index.ts).
//
//   last digit 0-2  CNF with coach and berth      2345678901
//   last digit 3-4  RAC with a position            2345678903
//   last digit 5-7  WL, quota GN / PQWL / TQWL     2345678905
//   last digit 8    CANCELLED                      2345678908
//   last digit 9    three passengers CNF/RAC/WL    2345678909
//   ends with 00    NOT_FOUND                      2345678900
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;
const CHART_LEAD_MS = 4 * 60 * 60 * 1000;
const BERTH_KINDS = ["LB", "UB", "SL"] as const;

const journeyLabelFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Kolkata",
});
const istTimeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

function digitAt(pnr: string, index: number): number {
  return Number(pnr.charAt(index));
}

/** YYYY-MM-DD for the IST calendar day containing `date`. */
function istDateKey(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function istWallClock(dateKey: string, hhmm: string): Date {
  return new Date(`${dateKey}T${hhmm}:00+05:30`);
}

interface LeadShape {
  readonly status: TicketStatus;
  readonly quota: Quota;
  readonly position: number | null;
  readonly coach?: string;
  readonly berth?: string;
}

function leadFor(last: number, prev: number): LeadShape {
  if (last <= 2) {
    const kind = BERTH_KINDS[last] ?? "LB";
    return { status: "CNF", quota: "GN", position: null, coach: `B${last + 1}`, berth: `${12 + 7 * last} ${kind}` };
  }
  if (last <= 4) return { status: "RAC", quota: "GN", position: 1 + prev };
  if (last <= 7) {
    const quota: Quota = last === 5 ? "GN" : last === 6 ? "PQWL" : "TQWL";
    return { status: "WL", quota, position: 5 + 3 * prev };
  }
  return { status: "CANCELLED", quota: "GN", position: null };
}

function passengersFor(lead: LeadShape, count: number, mixed: boolean): readonly PassengerSeat[] {
  if (mixed) {
    return [
      { index: 1, bookingStatus: "WL", currentStatus: "CNF", coach: "B1", berth: "12 LB", quota: "GN" },
      { index: 2, bookingStatus: "WL", currentStatus: "RAC", position: 4, quota: "GN" },
      { index: 3, bookingStatus: "WL", currentStatus: "WL", position: 9, quota: "GN" },
    ];
  }
  return Array.from({ length: count }, (_, i): PassengerSeat => {
    const base: PassengerSeat = {
      index: i + 1,
      bookingStatus: lead.status === "CNF" ? "WL" : lead.status,
      currentStatus: lead.status,
      quota: lead.quota,
    };
    if (lead.status === "CNF") return { ...base, coach: lead.coach, berth: i === 0 ? lead.berth : `${20 + i} ${BERTH_KINDS[i % 3]}` };
    if (lead.position !== null) return { ...base, position: lead.position + (lead.status === "RAC" ? i : 2 * i) };
    return base;
  });
}

function classFor(trainIndex: number, digit: number): BookingClass {
  const options = FIXTURE_CLASSES[trainIndex] ?? ["SL"];
  return options[digit % options.length] ?? "SL";
}

export function buildFixtureResult(pnr: string, now: Date = new Date()): PnrOutcome {
  if (!isValidPnr(pnr)) return { ok: false, code: "INVALID", message: PNR_INVALID_MESSAGE };
  if (pnr.endsWith("00")) {
    return { ok: false, code: "NOT_FOUND", message: "The source returned no reservation record for this PNR." };
  }

  const last = digitAt(pnr, 9);
  const prev = digitAt(pnr, 8);
  const trainIndex = digitAt(pnr, 6) % FIXTURE_TRAINS.length;
  const train: FixtureTrain = FIXTURE_TRAINS[trainIndex] ?? FIXTURE_TRAINS[0]!;
  const cls = classFor(trainIndex, digitAt(pnr, 7));
  const mixed = last === 9;
  const lead: LeadShape = mixed ? { status: "CNF", quota: "GN", position: null, coach: "B1", berth: "12 LB" } : leadFor(last, prev);
  const passengerCount = mixed ? 3 : 1 + (prev % 4);
  const pax = passengersFor(lead, passengerCount, mixed);

  const journeyDate = addDays(istDateKey(now), 1 + (digitAt(pnr, 5) % 6));
  const departure = istWallClock(journeyDate, train.depTime);
  const chartAt = new Date(departure.getTime() - CHART_LEAD_MS);
  const hoursToChart = Math.round(((chartAt.getTime() - now.getTime()) / 3_600_000) * 100) / 100;

  return {
    ok: true,
    result: {
      snapshot: {
        pnr,
        train,
        cls,
        journeyDate,
        journeyDateLabel: journeyLabelFormat.format(istWallClock(journeyDate, "12:00")),
        chartTime: istTimeFormat.format(chartAt),
        chartAt: chartAt.toISOString(),
        passengerCount,
        pax: [...pax],
        source: "fixture",
      },
      lead: {
        status: lead.status,
        position: lead.position,
        ...(lead.coach ? { coach: lead.coach } : {}),
        ...(lead.berth ? { berth: lead.berth } : {}),
        quota: lead.quota,
      },
      hoursToChart,
      checkedAt: now.toISOString(),
    },
  };
}

/** Clock for the sample source: pinned by E2E_NOW in end-to-end runs. */
export function fixtureClock(): Date {
  const pinned = process.env.E2E_NOW;
  return pinned ? new Date(pinned) : new Date();
}

export const fixtureSource: PnrDataSource = {
  async check(pnr) {
    return buildFixtureResult(pnr, fixtureClock());
  },
};
