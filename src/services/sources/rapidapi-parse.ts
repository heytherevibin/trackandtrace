import type { BookingClass, PassengerSeat, PnrResult, Quota } from "@/types/domain";
import { bookingClassSchema, quotaSchema } from "@/types/schemas";
import {
  chartPreparedFrom,
  isNoRecordMessage,
  isRecord,
  journeyLabelFormat,
  parseJourneyDate,
  parseSeatStatus,
  pick,
  text,
  whole,
  type Failure,
  type Json,
} from "./irctc-record";

export { parseJourneyDate, parseSeatStatus, type SeatParse } from "./irctc-record";

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

export type Irctc1Parse = { readonly ok: true; readonly result: PnrResult } | Failure;

const UNREADABLE = "The third-party provider returned a record this product cannot read. Nothing was shown in its place.";

function unavailable(message: string = UNREADABLE): Failure {
  return { ok: false, code: "SOURCE_UNAVAILABLE", message };
}

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
  return chartPreparedFrom(pick(record, K.chart));
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
    return isNoRecordMessage(message)
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
