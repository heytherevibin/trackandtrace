import { describe, expect, it } from "vitest";
import { messages } from "@/messages";
import { parseRailkitAvailabilityResponse, splitRawStatus } from "@/services/sources/railkit-availability-parse";
import type { AvailabilityRequest } from "@/services/availability-source";

// ---------------------------------------------------------------------------
// The parser, on the shapes measured live on 2026-09-23 from
// GET /api/v1/seats/12621/MAS/NDLS/23-9-2026/SL/GN.
//
// Two rules are load-bearing and each has its own test:
//   1. A refusal is never an empty day list. "We could not ask" and "there are
//      no berths" are different answers and a traveller acts on the second.
//   2. A real sold-out day -- REGRET, NOT AVAILABLE, canBook:false -- is a day.
//      Swallowing it as a failure is the mirror-image bug.
// ---------------------------------------------------------------------------

const OUT = messages.source.outcomes;
const AV = messages.source.availability;
const NOW = new Date("2026-09-23T06:30:00.000Z");

const REQUEST: AvailabilityRequest = {
  trainNo: "12621",
  from: "MAS",
  to: "NDLS",
  journeyDate: "2026-09-23",
  travelClass: "SL",
  quota: "GN",
};

/** Field names, types and the three day rows are verbatim from the measured response; fares are of the measured shape. */
const TRAIN = {
  trainNo: "12621",
  trainName: "TAMIL NADU EXP",
  from: "MAS",
  to: "NDLS",
  fromStationName: "MGR CHENNAI CTL",
  toStationName: "NEW DELHI",
  distance: 2175,
  travelClass: "SL",
  quota: "GN",
};

const FARE = { baseFare: 710, reservationCharge: 40, superfastCharge: 30, serviceTax: 0, totalFare: 780 };

/** Dates come back D-M-YYYY, not zero-padded. The first row is the one that matters: WAITLIST with canBook false. */
const DAYS = [
  { date: "23-9-2026", status: "WAITLIST", availabilityText: "Not Available", rawStatus: "NOT AVAILABLE", prediction: "No More Booking", predictionPercentage: 0, canBook: false },
  { date: "24-9-2026", status: "WAITLIST", availabilityText: "WL 26", rawStatus: "GNWL65/WL26", prediction: "77% Chance", predictionPercentage: 77, canBook: true },
  { date: "25-9-2026", status: "WAITLIST", availabilityText: "WL 56", rawStatus: "GNWL86/WL56", prediction: "42% Chance", predictionPercentage: 42, canBook: true },
];

function body(overrides: Record<string, unknown> = {}): unknown {
  return { success: true, data: { train: TRAIN, fare: FARE, availability: DAYS, ...overrides } };
}

function parse(value: unknown) {
  return parseRailkitAvailabilityResponse(value, REQUEST, NOW);
}

describe("splitRawStatus", () => {
  it.each([
    ["GNWL65/WL26", 65, 26],
    ["PQWL30/WL14", 30, 14],
    ["RLWL12/WL5", 12, 5],
    ["TQWL8/WL3", 8, 3],
    ["CKWL10/CKWL3", 10, 3],
  ])("reads %s as the booking-position waitlist and the current one", (raw, booking, current) => {
    expect(splitRawStatus(raw)).toEqual({ booking, current });
  });

  it.each(["NOT AVAILABLE", "AVAILABLE 0042", "RAC 12", "REGRET", "CURR_AVBL", "", "TRAIN DEPARTED"])(
    "leaves both halves null for %s, which is a normal form and not an error",
    (raw) => {
      expect(splitRawStatus(raw)).toEqual({ booking: null, current: null });
    },
  );
});

describe("parseRailkitAvailabilityResponse", () => {
  it("reads the measured response into the seam's answer", () => {
    const out = parse(body());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.answer.train).toEqual({ no: "12621", name: "TAMIL NADU EXP", fromName: "MGR CHENNAI CTL", toName: "NEW DELHI", distanceKm: 2175 });
    expect(out.answer.fare).toEqual({ base: 710, reservation: 40, superfast: 30, gst: 0, total: 780 });
    expect(out.answer.retrievedAt).toBe(NOW.toISOString());
    expect(out.answer.days).toHaveLength(3);
  });

  it("normalises the provider's unpadded D-M-YYYY date to ISO", () => {
    const out = parse(body());
    expect(out.ok && out.answer.days.map((d) => d.date)).toEqual(["2026-09-23", "2026-09-24", "2026-09-25"]);
  });

  it("keeps the raw status verbatim and both waitlist numbers beside it", () => {
    const out = parse(body());
    expect(out.ok && out.answer.days[1]).toMatchObject({ rawStatus: "GNWL65/WL26", wlBooking: 65, wlCurrent: 26, availabilityText: "WL 26", canBook: true });
  });

  it("keeps the source's own prediction, which the observation store records and no page renders", () => {
    const out = parse(body());
    expect(out.ok && out.answer.days[1]).toMatchObject({ prediction: "77% Chance", predictionPercentage: 77 });
    expect(out.ok && out.answer.days[0]).toMatchObject({ prediction: "No More Booking", predictionPercentage: 0 });
  });

  it("reads a WAITLIST day whose booking has closed as a day, keeping status and canBook apart", () => {
    const out = parse(body());
    expect(out.ok && out.answer.days[0]).toMatchObject({ status: "WAITLIST", canBook: false, rawStatus: "NOT AVAILABLE", wlBooking: null, wlCurrent: null });
  });

  it.each([
    ["REGRET", "REGRET", "REGRET", false],
    ["a regret whose raw text runs longer", "REGRET", "REGRET NO ROOM", false],
    ["an available day", "AVAILABLE", "AVAILABLE 0042", true],
    ["a RAC day", "RAC", "RAC 12", true],
    ["a current-availability day", "CURR_AVBL", "CURR_AVBL", true],
  ])("treats %s as an answer, not a failure", (_label, status, rawStatus, canBook) => {
    const out = parse(body({ availability: [{ ...DAYS[0], status, rawStatus, availabilityText: rawStatus, canBook }] }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.answer.days).toHaveLength(1);
    expect(out.answer.days[0]).toMatchObject({ status, rawStatus, canBook });
  });

  it("reads the payload whether or not the provider wraps it in data", () => {
    const wrapped = parse(body());
    const flat = parse({ success: true, train: TRAIN, fare: FARE, availability: DAYS });
    expect(wrapped.ok).toBe(true);
    expect(flat.ok).toBe(true);
    if (!wrapped.ok || !flat.ok) return;
    expect(flat.answer.days).toEqual(wrapped.answer.days);
  });
});

describe("what must never read as no seats", () => {
  it("refuses an empty availability array rather than answering with no days", () => {
    const out = parse(body({ availability: [] }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
  });

  it("refuses a day with no canBook rather than assuming it cannot be booked", () => {
    const withoutCanBook: Record<string, unknown> = { ...DAYS[1] };
    delete withoutCanBook.canBook;
    const out = parse(body({ availability: [withoutCanBook] }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
  });

  it.each([
    ["a non-boolean canBook", { ...DAYS[1], canBook: "true" }],
    ["a missing rawStatus", { ...DAYS[1], rawStatus: "" }],
    ["an unreadable date", { ...DAYS[1], date: "not a date" }],
    ["a missing status", { ...DAYS[1], status: "" }],
  ])("refuses %s rather than dropping the day quietly", (_label, day) => {
    const out = parse(body({ availability: [day] }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
  });

  it.each([
    ["no body at all", null],
    ["an array", []],
    ["success false with no error", { success: false }],
    ["no availability key", { success: true, data: { train: TRAIN, fare: FARE } }],
    ["availability that is not an array", { success: true, data: { train: TRAIN, fare: FARE, availability: {} } }],
    ["a train block that is missing", { success: true, data: { fare: FARE, availability: DAYS } }],
    ["a fare block that is missing", { success: true, data: { train: TRAIN, availability: DAYS } }],
    ["a different train than the one asked about", { success: true, data: { train: { ...TRAIN, trainNo: "12951" }, fare: FARE, availability: DAYS } }],
  ])("fails closed on %s", (_label, value) => {
    const out = parse(value);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
  });
});

describe("the route the answer claims to be about", () => {
  it.each([
    ["a different origin", { from: "SBC" }],
    ["a different destination", { to: "BCT" }],
    ["a different class", { travelClass: "3A" }],
    ["a different quota", { quota: "TQ" }],
  ])("refuses an answer echoing %s, which is a question we did not ask", (_label, patch) => {
    const out = parse(body({ train: { ...TRAIN, ...patch } }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
    expect(out.code).not.toBe("NOT_FOUND");
  });

  it("compares the echo regardless of the case either side sends it in", () => {
    const shouted = parse(body({ train: { ...TRAIN, from: "mas", to: "ndls", travelClass: "sl", quota: "gn" } }));
    expect(shouted.ok).toBe(true);
  });

  it("still answers when the provider stops echoing the route at all", () => {
    const out = parse(body({ train: { trainNo: "12621", trainName: "TAMIL NADU EXP", fromStationName: "MGR CHENNAI CTL", toStationName: "NEW DELHI", distance: 2175 } }));
    expect(out.ok).toBe(true);
    expect(out.ok && out.answer.days).toHaveLength(3);
  });
});

describe("the measured refusals", () => {
  const refusal = (error: string) => parse({ success: false, error });

  it("maps a station that is not on the train's route to a member-readable invalid input", () => {
    const out = refusal("MAS is not an intermediate station of train 12951");
    expect(out).toMatchObject({ ok: false, code: "INVALID", message: AV.notOnRoute });
  });

  it.each([
    ["Invalid date format. Use DD-MM-YYYY.", "the date format we send"],
    ["Date still invalid after normalization.", "a date the provider could not normalise"],
  ])("maps %s to invalid input — %s is our bug, never the traveller's", (error) => {
    const out = refusal(error);
    expect(out).toMatchObject({ ok: false, code: "INVALID", message: AV.dateNotAccepted });
  });

  it.each([
    ["No valid Profile found for this Train, Date and Station.", "server"],
    ["Unable to process your request", "server"],
    ["Failed to fetch availability", "unreadable"],
    ["something nobody has measured yet", "unreadable"],
  ])("maps %s to unavailable with cause %s", (error, cause) => {
    const out = refusal(error);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
    expect(out.cause).toBe(cause);
    expect(out.message).toBe(AV.couldNotAnswer);
  });

  it("never turns a refusal into a not-found or into an answer with no days", () => {
    for (const error of ["not an intermediate station of train 12951", "Unable to process your request", "Failed to fetch availability"]) {
      const out = refusal(error);
      expect(out.ok).toBe(false);
      if (out.ok) continue;
      expect(out.code).not.toBe("NOT_FOUND");
      expect(out.message).not.toBe(OUT.noRecord);
      expect(out).not.toHaveProperty("answer");
    }
  });

  it("names no provider, key, plan or HTTP status in anything a member reads", () => {
    const said = [AV.couldNotAnswer, AV.notOnRoute, AV.dateNotAccepted];
    for (const sentence of said) expect(sentence).not.toMatch(/railkit|rapid|irctcapi|api key|plan|quota|400|401|429|http/i);
  });
});
