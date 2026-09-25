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
// Everything that could be mistaken for an answer fails closed: a record this
// cannot read becomes "unavailable", never an answer with no days. A day list
// that is empty is unreadable, not sold out.
//
// **The fare is the deliberate exception, and the only one.** Nothing reads it —
// no column stores it, no page renders it — so failing the whole answer over an
// absent charge threw away an observation that can never be made again, because
// a past journey date answers 400. It is read when whole and null otherwise.
// `percent` makes the same trade for a prediction percentage the column cannot
// hold. Both are argued where they are written; neither is a licence to soften
// anything a traveller would act on.
// ---------------------------------------------------------------------------

const OUT = messages.source.outcomes;
const AV = messages.source.availability;

const TRAIN_NO = /^\d{5}$/;
/**
 * `GNWL65/WL26` → 65 and 26. The quota prefix varies (GNWL, PQWL, RLWL, TQWL,
 * CKWL …) so it is matched, never hard-coded, and the second prefix is optional
 * because both `…/WL26` and `…/CKWL3` occur.
 *
 * **RAC pairs count too.** `RAC  58/RAC  51`, measured live on 2026-09-26, is the
 * same fact in the same shape — where the queue opened and where it is now — and
 * the provider labels it `status: WAITLIST` like the rest. Matching only `…WL`
 * threw the movement away and left the card drawing a queue with no figure.
 *
 * `RAC 12` alone still reads as nothing, and must: that is a position in the RAC
 * queue, not a pair, and the `/` is what separates the two readings.
 */
const WAITLIST_PAIR = /^(?:[A-Z]{0,6}WL|RAC)\s*(\d{1,5})\s*\/\s*(?:[A-Z]{0,6}WL|RAC)?\s*(\d{1,5})$/i;
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
export type AvailabilityRefusal =
  | "not-on-route"
  | "our-date-format"
  | "class-not-carried"
  | "not-bookable-on-date"
  | "our-class-code"
  | "no-profile"
  | "upstream"
  | "unreadable";

/** Every arm was measured live (2026-09-23, extended 2026-09-25); anything unmeasured falls through to "unreadable", which is the safe side. */
export function classifyAvailabilityRefusal(message: string): AvailabilityRefusal {
  const said = message.toLowerCase();
  if (said.includes("not an intermediate station")) return "not-on-route";
  if (said.includes("invalid date format") || said.includes("date still invalid")) return "our-date-format";
  // Measured 2026-09-25, probing 12649 YPR → NZM across seven dates and six classes.
  if (said.includes("class does not exist in this train")) return "class-not-carried";
  if (said.includes("not available for booking for this date")) return "not-bookable-on-date";
  if (said.includes("invalid coach type")) return "our-class-code";
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
    // Two facts about the railway. INVALID rather than SOURCE_UNAVAILABLE is load-bearing here:
    // the breaker ignores INVALID by design — "a wrong question ... the breaker learns nothing
    // from it" — and a route search asks one class of every train at once, so a handful of trains
    // that do not carry the chosen class would otherwise rest the whole availability feature.
    case "class-not-carried":
      return { ok: false, code: "INVALID", message: AV.classNotCarried };
    case "not-bookable-on-date":
      return { ok: false, code: "INVALID", message: AV.notBookableOnDate };
    case "our-class-code":
      // Ours too: the provider did not recognise the code we sent, which no traveller types.
      return { ok: false, code: "INVALID", message: AV.invalidRequest };
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

/**
 * The source's own confirmation guess, bounded by what the column that receives it can hold.
 *
 * `source_prediction_pct` is `numeric(5,2)`, so Postgres refuses any magnitude at or above 1000 —
 * and the four days of a window are written as **one batch**, so a single absurd value used to lose
 * the whole window rather than the one number nothing reads. Same trade as the fare above: parse it
 * when it is storable, drop it when it is not, and keep the availability either way.
 *
 * Bounded by the column and not by "0 to 100" on purpose. The column is a measured constraint; what
 * range this provider's percentage takes is not, and narrowing to an unmeasured guess would discard
 * real readings to no end. `source_prediction` keeps the source's own words beside it regardless.
 */
const PREDICTION_PCT_LIMIT = 1000;

function percent(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(n) && Math.abs(n) < PREDICTION_PCT_LIMIT ? n : null;
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

/**
 * The fare, or null — and **null never fails the answer**.
 *
 * This is the one block in this file that does not fail closed, and the asymmetry is deliberate.
 * Everywhere else, something unreadable could be mistaken for "no berths", and a traveller acts on
 * that. Nothing acts on this: `availability_observations` has no fare column, no page renders one,
 * and the block was measured on a single train. Refusing the whole answer over one absent charge
 * therefore cost an observation that can never be made again — a past journey date answers
 * `400 Failed to fetch availability` — plus a band of journey dates and a refusal strike against
 * the combo, all to protect a number no reader has.
 *
 * All-or-nothing within itself, though: a fare missing its GST is not a fare, and a zero standing
 * in for an absent charge would be invented rather than read. `pick` treats absent, `null` and `""`
 * alike; a genuine `0` passes, which is the ordinary GST-exempt case and is pinned by a test.
 */
function fareFrom(value: unknown): AvailabilityAnswer["fare"] {
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
  if (!train) return unreadable();
  // The fare does NOT fail the answer. See `fareFrom`, and `AvailabilityAnswer.fare`.
  const fare = fareFrom(record.fare);

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
