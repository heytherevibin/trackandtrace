import type { BookingClass, PassengerSeat, PnrResult, Quota, Station } from "@/types/domain";
import { bookingClassSchema, quotaSchema } from "@/types/schemas";
import {
  chartPreparedFrom,
  isNoRecordMessage,
  isRecord,
  journeyLabelFormat,
  parseClockTime,
  parseJourneyDate,
  parseSeatStatus,
  text,
  whole,
  type Failure,
  type Json,
  type SeatParse,
} from "./irctc-record";

// ---------------------------------------------------------------------------
// Reads RailKit's PNR answer (GET https://api.railkit.in/api/v1/pnr/:pnr) into
// the domain record. Pure: no I/O, no clock beyond the `now` passed in.
//
// RailKit is a third party, not affiliated with IRCTC or Indian Railways, and
// not an official source. Every field this product renders is validated and
// anything unreadable fails closed. The fare and booking time are never read,
// and RailKit sends no passenger names.
// ---------------------------------------------------------------------------

export type RailkitParse = { readonly ok: true; readonly result: PnrResult } | Failure;

const UNREADABLE = "RailKit returned a record this product cannot read. Nothing was shown in its place.";
const STATION_CODE = /^[A-Z]{2,5}$/;
const WAITLIST_CODE = /^(GN|PQ|RL|TQ|RS|RQ|CK)?WL$/;

function unavailable(message: string = UNREADABLE): Failure {
  return { ok: false, code: "SOURCE_UNAVAILABLE", message };
}

function child(parent: Json, key: string): Json | undefined {
  const value = parent[key];
  return isRecord(value) ? value : undefined;
}

function stationFrom(value: Json | undefined): Station | null {
  const code = value ? text(value, ["code"])?.toUpperCase() : undefined;
  if (!code || !STATION_CODE.test(code)) return null;
  const name = text(value!, ["name"]);
  return name ? { code, city: name } : { code };
}

/** A seat from RailKit's structured fields, written in IRCTC notation and read by the shared parser. */
function seatFromStructured(raw: Json): SeatParse | null {
  const status = text(raw, ["status"])?.toUpperCase();
  if (!status) return null;
  const coach = text(raw, ["coach"])?.toUpperCase();
  const berthNo = whole(raw, ["berthNo"]);
  const number = berthNo !== undefined && berthNo > 0 ? String(berthNo) : undefined;
  const code = text(raw, ["berthCode"])?.toUpperCase();

  if (status === "CAN" || status === "CANCELLED") return parseSeatStatus("CAN");
  if (WAITLIST_CODE.test(status)) return number ? parseSeatStatus(`${status}/${number}`) : null;
  if (status === "RAC" || status === "CNF") {
    const notation = coach ? [status, coach, number, code] : [status, number];
    return parseSeatStatus(notation.filter(Boolean).join("/"));
  }
  return null;
}

/** RailKit also sends the seat as display text ("CNF , B5 - 22 [LB]"); used only when the structured status is absent. */
function seatFromDetails(raw: Json): SeatParse | null {
  const details = text(raw, ["details"]);
  return details ? parseSeatStatus(details.replace(/[[\]()]/g, " ")) : null;
}

function seatOf(value: unknown): SeatParse | null {
  if (!isRecord(value)) return null;
  return text(value, ["status"]) ? seatFromStructured(value) : seatFromDetails(value);
}

function passengerFrom(raw: unknown, fallbackIndex: number, quota: Quota): PassengerSeat | null {
  if (!isRecord(raw)) return null;
  const booking = seatOf(raw.booking);
  const current = seatOf(raw.current);
  if (!booking || !current) return null;

  const serial = text(raw, ["serialNumber"])?.match(/\d+/)?.[0];
  const index = serial ? Number(serial) : fallbackIndex;
  const seated = current.status !== "CANCELLED";

  return {
    index: index > 0 ? index : fallbackIndex,
    bookingStatus: booking.status,
    currentStatus: current.status,
    ...(current.position !== undefined ? { position: current.position } : {}),
    ...(seated && current.coach ? { coach: current.coach } : {}),
    ...(seated && current.coach && current.berth ? { berth: current.berth } : {}),
    quota: current.quota ?? booking.quota ?? quota,
  };
}

function refusal(body: Json): Failure {
  const message = typeof body.error === "string" ? body.error : "";
  return isNoRecordMessage(message)
    ? { ok: false, code: "NOT_FOUND", message: "RailKit has no reservation record for this PNR." }
    : unavailable("RailKit could not answer for this PNR. Nothing was shown in its place.");
}

export function parseRailkitPnrResponse(body: unknown, pnr: string, now: Date): RailkitParse {
  if (!isRecord(body)) return unavailable();
  if (body.success === false) return refusal(body);
  if (body.success !== true) return unavailable();

  const record = child(body, "data");
  if (!record) return unavailable();

  const returnedPnr = text(record, ["pnr"]);
  if (returnedPnr && returnedPnr !== pnr) return unavailable();

  const train = child(record, "train");
  const number = train ? text(train, ["number"]) : undefined;
  if (!train || !number || !/^\d{5}$/.test(number)) return unavailable();

  const journey = child(record, "journey");
  if (!journey) return unavailable();

  const dojRaw = text(journey, ["dateOfJourney"]);
  const journeyDate = dojRaw ? parseJourneyDate(dojRaw) : null;
  if (!journeyDate) return unavailable();

  const from = stationFrom(child(journey, "source"));
  const to = stationFrom(child(journey, "destination"));
  if (!from || !to) return unavailable();

  const clsParse = bookingClassSchema.safeParse(text(journey, ["class"])?.toUpperCase());
  if (!clsParse.success) return unavailable();
  const cls: BookingClass = clsParse.data;

  const passengersRaw = record.passengers;
  if (!Array.isArray(passengersRaw) || passengersRaw.length === 0) return unavailable();

  const quotaParse = quotaSchema.safeParse(text(journey, ["quota"])?.toUpperCase());
  const firstBooking = isRecord(passengersRaw[0]) ? seatOf(passengersRaw[0].booking) : null;
  const recordQuota: Quota | undefined = quotaParse.success ? quotaParse.data : firstBooking?.quota;
  if (!recordQuota) return unavailable();

  const pax: PassengerSeat[] = [];
  for (const [i, raw] of passengersRaw.entries()) {
    const seat = passengerFrom(raw, i + 1, recordQuota);
    if (!seat) return unavailable();
    pax.push(seat);
  }
  const lead = pax[0]!;

  const name = text(train, ["name"]);
  const depTime = dojRaw ? parseClockTime(dojRaw) : null;
  const distance = whole(journey, ["distance"]);
  const chart = child(record, "chart");
  const chartPrepared = chart ? chartPreparedFrom(chart.status) : undefined;

  const result: PnrResult = {
    snapshot: {
      pnr,
      train: {
        number,
        ...(name ? { name } : {}),
        from,
        to,
        ...(depTime ? { depTime } : {}),
        ...(distance !== undefined && distance > 0 ? { distanceKm: distance } : {}),
      },
      cls,
      journeyDate,
      journeyDateLabel: journeyLabelFormat.format(new Date(`${journeyDate}T12:00:00+05:30`)),
      ...(chartPrepared !== undefined ? { chartPrepared } : {}),
      passengerCount: pax.length,
      pax,
      source: "railkit",
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
