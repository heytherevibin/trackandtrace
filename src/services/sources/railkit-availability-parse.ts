import { messages } from "@/messages";
import type { AvailabilityAnswer, AvailabilityDayRecord, AvailabilityOutcome, AvailabilityRequest } from "@/services/availability-source";
import { isRecord, parseJourneyDate, pick, text, type Json } from "./irctc-record";
import { unavailable, type SourceFailure } from "./outcome";

// ---------------------------------------------------------------------------
// Reads RailKit's seat answer (GET /api/v1/seats/:trainNo/:from/:to/:date/
// :class/:quota) into the availability seam. Pure: no I/O, no clock beyond the
// `now` passed in, no logging.
//
// Shapes measured live on 2026-09-23 against 12621 MAS–NDLS SL GN. Two things
// that response teaches, and both are pinned by tests:
//
//   * `status` alone does not say whether a berth can be had. The day nearest
//     departure came back `status: WAITLIST` with `canBook: false` and
//     `rawStatus: NOT AVAILABLE` — booking had closed. Anything reading
//     `status` without `canBook` is wrong on exactly the rows that matter most.
//   * Dates arrive `D-M-YYYY`, not zero-padded (`23-9-2026`). They are
//     normalised to ISO here, on the way in.
//
// Everything fails closed: a record this cannot read becomes "unavailable",
// never an answer with no days. A day list that is empty is unreadable, not
// sold out.
// ---------------------------------------------------------------------------

const OUT = messages.source.outcomes;
const AV = messages.source.availability;

const TRAIN_NO = /^\d{5}$/;
/**
 * `GNWL65/WL26` → 65 and 26. The quota prefix varies (GNWL, PQWL, RLWL, TQWL,
 * CKWL …) so it is matched, never hard-coded, and the second prefix is optional
 * because both `…/WL26` and `…/CKWL3` occur.
 */
const WAITLIST_PAIR = /^[A-Z]{0,6}WL\s*(\d{1,5})\s*\/\s*(?:[A-Z]{0,6}WL)?\s*(\d{1,5})$/i;
/**
 * `AVAILABLE 0042` → 42. Anchored at the start on purpose: `NOT AVAILABLE`
 * contains the word, and a count read out of it would be a berth count on a day
 * with no berths. The separator is a space or a hyphen, both of which occur.
 */
const AVAILABLE_COUNT = /^AVAILABLE[\s-]+(\d{1,5})\b/i;

export interface WaitlistSplit {
  readonly booking: number | null;
  readonly current: number | null;
}

/**
 * The booking-position waitlist and the current one, when `rawStatus` carries
 * both. `NOT AVAILABLE`, `AVAILABLE 0042`, `RAC 12`, `REGRET` and `CURR_AVBL`
 * are ordinary forms that hold no pair: they return two nulls and the caller
 * keeps `rawStatus` verbatim. **This is not a parse failure** — treating it as
 * one would fail closed on the very rows that say a berth is free.
 */
export function splitRawStatus(raw: string): WaitlistSplit {
  const match = WAITLIST_PAIR.exec(raw.trim());
  if (!match) return { booking: null, current: null };
  const booking = Number(match[1]);
  const current = Number(match[2]);
  return Number.isInteger(booking) && Number.isInteger(current) ? { booking, current } : { booking: null, current: null };
}

/**
 * The berth count an `AVAILABLE` day carries, or null.
 *
 * Null for every other form, by the same rule as the waitlist split: a form that
 * holds no count is normal, not an error. Two of those are worth naming because
 * the mistakes are tempting and silent — **`RAC 12` is a position in the RAC
 * queue, not twelve berths**, and `NOT AVAILABLE` contains the word `AVAILABLE`.
 * Either misread would feed a model a confident wrong number on exactly the rows
 * nearest departure.
 */
export function seatsFromRawStatus(raw: string): number | null {
  const match = AVAILABLE_COUNT.exec(raw.trim());
  if (!match) return null;
  const seats = Number(match[1]);
  return Number.isInteger(seats) && seats >= 0 ? seats : null;
}

/** Which measured refusal this is. Kept separate from the outcome so the adapter can log our own bug loudly. */
export type AvailabilityRefusal = "not-on-route" | "our-date-format" | "no-profile" | "upstream" | "unreadable";

/** Every arm was measured on 2026-09-23; anything unmeasured falls through to "unreadable", which is the safe side. */
export function classifyAvailabilityRefusal(message: string): AvailabilityRefusal {
  const said = message.toLowerCase();
  if (said.includes("not an intermediate station")) return "not-on-route";
  if (said.includes("invalid date format") || said.includes("date still invalid")) return "our-date-format";
  if (said.includes("no valid profile found")) return "no-profile";
  if (said.includes("unable to process your request")) return "upstream";
  // "Failed to fetch availability" is a past date — unreadable by design — and the text is too
  // generic to tell a traveller that is why, so it joins the unmeasured refusals.
  return "unreadable";
}

export function refusalFailure(kind: AvailabilityRefusal): SourceFailure {
  switch (kind) {
    case "not-on-route":
      return { ok: false, code: "INVALID", message: AV.notOnRoute };
    case "our-date-format":
      // Our bug, never the traveller's: the adapter is the only place that writes this date.
      return { ok: false, code: "INVALID", message: AV.dateNotAccepted };
    case "no-profile":
    case "upstream":
      return unavailable(AV.couldNotAnswer, "server");
    case "unreadable":
      return unavailable(AV.couldNotAnswer, "unreadable");
  }
}

function unreadable(): SourceFailure {
  return unavailable(OUT.unreadable, "unreadable");
}

/** A non-negative amount, integer or not: fares and distances are numbers on the wire, and rounding them here would be inventing. */
function amount(source: Json, key: string): number | null {
  const value = pick(source, [key]);
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function percent(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * The provider has been seen to wrap its payload in `data` and the envelope key
 * was not recorded for this endpoint, so both shapes are read. Neither is
 * guessed at: the block that actually carries `availability` wins.
 */
function payloadOf(body: Json): Json | null {
  const data = isRecord(body.data) ? body.data : null;
  if (data && Array.isArray(data.availability)) return data;
  if (Array.isArray(body.availability)) return body;
  return data;
}

/**
 * The response echoes what the URL asked for. `trainNo` is checked by the caller; these four are
 * the rest. Each is compared when present and ignored when absent, exactly as the PNR parser
 * treats the PNR it gets back: an echo that
 * *disagrees* is an answer to a question we did not ask, while an echo the provider stops sending
 * is no reason to refuse a berth count. A crawler issues thousands of these and reads none of them
 * by eye, so the only thing that will ever notice a swapped route is this comparison.
 */
function echoesRequest(value: Json, request: AvailabilityRequest): boolean {
  const pairs: readonly (readonly [string, string])[] = [
    ["from", request.from],
    ["to", request.to],
    ["travelClass", request.travelClass],
    ["quota", request.quota],
  ];
  return pairs.every(([key, asked]) => {
    const echoed = text(value, [key])?.toUpperCase();
    return echoed === undefined || echoed === asked.trim().toUpperCase();
  });
}

function trainFrom(value: unknown, request: AvailabilityRequest): AvailabilityAnswer["train"] | null {
  if (!isRecord(value)) return null;
  const no = text(value, ["trainNo"]);
  // A record about a different train answers a question we did not ask.
  if (!no || !TRAIN_NO.test(no) || no !== request.trainNo.trim()) return null;
  if (!echoesRequest(value, request)) return null;
  const name = text(value, ["trainName"]);
  const fromName = text(value, ["fromStationName"]);
  const toName = text(value, ["toStationName"]);
  const distanceKm = amount(value, "distance");
  if (!name || !fromName || !toName || distanceKm === null) return null;
  return { no, name, fromName, toName, distanceKm };
}

function fareFrom(value: unknown): AvailabilityAnswer["fare"] | null {
  if (!isRecord(value)) return null;
  const base = amount(value, "baseFare");
  const reservation = amount(value, "reservationCharge");
  const superfast = amount(value, "superfastCharge");
  const gst = amount(value, "serviceTax");
  const total = amount(value, "totalFare");
  if (base === null || reservation === null || superfast === null || gst === null || total === null) return null;
  return { base, reservation, superfast, gst, total };
}

function dayFrom(raw: unknown): AvailabilityDayRecord | null {
  if (!isRecord(raw)) return null;
  const dateRaw = text(raw, ["date"]);
  const date = dateRaw ? parseJourneyDate(dateRaw) : null;
  const status = text(raw, ["status"])?.toUpperCase();
  const rawStatus = text(raw, ["rawStatus"]);
  // `canBook` is never defaulted. Absent or not a boolean means the day is unreadable — assuming
  // false would print "sold out" over a berth that is free.
  const canBook = raw.canBook;
  if (!date || !status || !rawStatus || typeof canBook !== "boolean") return null;

  const waitlist = splitRawStatus(rawStatus);
  return {
    date,
    status,
    // The source's own short text, or its own raw status when it sends none. Never our words.
    availabilityText: text(raw, ["availabilityText"]) ?? rawStatus,
    rawStatus,
    canBook,
    wlBooking: waitlist.booking,
    wlCurrent: waitlist.current,
    seats: seatsFromRawStatus(rawStatus),
    prediction: text(raw, ["prediction"]) ?? null,
    predictionPercentage: percent(raw.predictionPercentage),
  };
}

export function parseRailkitAvailabilityResponse(body: unknown, request: AvailabilityRequest, now: Date): AvailabilityOutcome {
  if (!isRecord(body)) return unreadable();
  if (body.success === false) return refusalFailure(classifyAvailabilityRefusal(typeof body.error === "string" ? body.error : ""));

  const record = payloadOf(body);
  if (!record) return unreadable();

  const train = trainFrom(record.train, request);
  const fare = fareFrom(record.fare);
  if (!train || !fare) return unreadable();

  const rows = record.availability;
  // No rows is not "no berths": the window is always four dates, so an empty list means we could
  // not read the answer.
  if (!Array.isArray(rows) || rows.length === 0) return unreadable();

  const days: AvailabilityDayRecord[] = [];
  for (const row of rows) {
    const day = dayFrom(row);
    // One unreadable day fails the whole answer rather than shrinking the list quietly, because a
    // list short by one day is indistinguishable from a day with nothing left.
    if (!day) return unreadable();
    days.push(day);
  }

  return { ok: true, answer: { train, fare, days, retrievedAt: now.toISOString() } };
}
