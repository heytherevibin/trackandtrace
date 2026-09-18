import { describe, expect, it } from "vitest";
import { parseIrctc1Response, parseJourneyDate, parseSeatStatus } from "@/services/sources/rapidapi-parse";
import { pnrApiOkSchema, pnrResultSchema } from "@/types/schemas";

// Payload shapes: IRCTC1 v3 on RapidAPI answers in PascalCase (PassengerStatus, CurrentStatus, TrainNo);
// client code in the wild also meets a camelCase variant (passengerList, currentStatus, trainNumber).
// Confirm the live shape with `npm run source:probe` before relying on a field.

const NOW = new Date("2026-09-17T06:30:00.000Z");
const PNR = "4949608635";

function pascal(overrides: Record<string, unknown> = {}) {
  return {
    status: true,
    message: "Success",
    data: {
      Pnr: PNR,
      TrainNo: "12658",
      TrainName: "SBC MAS SF MAIL",
      Doj: "25-09-2026",
      From: "SBC",
      To: "MAS",
      BoardingStationName: "KSR Bengaluru",
      ReservationUptoName: "Chennai Central",
      Class: "3A",
      Quota: "GN",
      ChartPrepared: false,
      DepartureTime: "22:40",
      PassengerCount: 2,
      PassengerStatus: [
        { Number: 1, BookingStatus: "GNWL/12", CurrentStatus: "CNF/B2/41/LB", Prediction: "Confirm", PredictionPercentage: "92", Name: "SHOULD NOT MAP" },
        { Number: 2, BookingStatus: "GNWL/13", CurrentStatus: "GNWL 5", ConfirmTktStatus: "Probable" },
      ],
      ...overrides,
    },
  };
}

describe("parseSeatStatus", () => {
  it.each([
    ["CNF", { status: "CNF" }],
    ["CNF/B2/41/LB", { status: "CNF", coach: "B2", berth: "41 LB" }],
    ["CNF B2 41", { status: "CNF", coach: "B2", berth: "41" }],
    ["S5/33/UB", { status: "CNF", coach: "S5", berth: "33 UB" }],
    ["RAC 12", { status: "RAC", position: 12 }],
    ["RAC/4", { status: "RAC", position: 4 }],
    ["RAC/S4/33/SL", { status: "RAC", coach: "S4", berth: "33 SL" }],
    ["WL 7", { status: "WL", position: 7 }],
    ["GNWL/45", { status: "WL", position: 45, quota: "GN" }],
    ["GNWL  12", { status: "WL", position: 12, quota: "GN" }],
    ["PQWL 3", { status: "WL", position: 3, quota: "PQWL" }],
    ["RLWL/9", { status: "WL", position: 9, quota: "RLWL" }],
    ["TQWL12", { status: "WL", position: 12, quota: "TQWL" }],
    ["CAN", { status: "CANCELLED" }],
    ["Cancelled", { status: "CANCELLED" }],
  ])("reads %s", (raw, expected) => {
    expect(parseSeatStatus(raw)).toEqual(expected);
  });

  it.each(["", "NOSB", "REGRET", "Confirm", "???"])("refuses %s rather than guess", (raw) => {
    expect(parseSeatStatus(raw)).toBeNull();
  });
});

describe("parseJourneyDate", () => {
  it.each([
    ["25-09-2026", "2026-09-25"],
    ["2026-09-25", "2026-09-25"],
    ["25/09/2026", "2026-09-25"],
    ["Sep 25, 2026 10:40:00 PM", "2026-09-25"],
    ["25 Sep 2026", "2026-09-25"],
  ])("reads %s", (raw, expected) => {
    expect(parseJourneyDate(raw)).toBe(expected);
  });

  it.each(["", "31-02-2026", "tomorrow", "2026-13-01"])("refuses %s", (raw) => {
    expect(parseJourneyDate(raw)).toBeNull();
  });
});

describe("parseIrctc1Response", () => {
  it("maps the PascalCase shape into a record labelled with its third-party source", () => {
    const out = parseIrctc1Response(pascal(), PNR, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const { snapshot, lead } = out.result;
    expect(snapshot.source).toBe("rapidapi");
    expect(snapshot.pnr).toBe(PNR);
    expect(snapshot.train).toMatchObject({ number: "12658", name: "SBC MAS SF MAIL", depTime: "22:40" });
    expect(snapshot.train.from).toEqual({ code: "SBC", city: "KSR Bengaluru" });
    expect(snapshot.train.to).toEqual({ code: "MAS", city: "Chennai Central" });
    expect(snapshot.journeyDate).toBe("2026-09-25");
    expect(snapshot.cls).toBe("3A");
    expect(snapshot.chartPrepared).toBe(false);
    expect(snapshot.passengerCount).toBe(2);
    expect(snapshot.pax).toEqual([
      { index: 1, bookingStatus: "WL", currentStatus: "CNF", coach: "B2", berth: "41 LB", quota: "GN" },
      { index: 2, bookingStatus: "WL", currentStatus: "WL", position: 5, quota: "GN" },
    ]);
    expect(lead).toEqual({ status: "CNF", position: null, coach: "B2", berth: "41 LB", quota: "GN" });
    expect(out.result.checkedAt).toBe(NOW.toISOString());
  });

  it("produces records the wire contract accepts, so the browser renders them", () => {
    for (const body of [pascal(), pascal({ DepartureTime: undefined, BoardingStationName: undefined, ChartPrepared: undefined })]) {
      const out = parseIrctc1Response(body, PNR, NOW);
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(pnrResultSchema.safeParse(out.result).success).toBe(true);
      const envelope = { ok: true, source: out.result.snapshot.source, cached: false, latencyMs: 2125, rate: { remaining: 19, limit: 20 }, data: out.result };
      expect(pnrApiOkSchema.safeParse(JSON.parse(JSON.stringify(envelope))).success).toBe(true);
    }
  });

  it("never carries the provider's predictions or passenger names", () => {
    const out = parseIrctc1Response(pascal(), PNR, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const text = JSON.stringify(out.result);
    expect(out.result.prediction).toBeUndefined();
    expect(text).not.toMatch(/Confirm|Probable|SHOULD NOT MAP|92/);
    for (const p of out.result.snapshot.pax) expect(p.name).toBeUndefined();
  });

  it("leaves fields the provider did not send unset instead of estimating them", () => {
    const out = parseIrctc1Response(pascal({ DepartureTime: undefined, BoardingStationName: undefined, ChartPrepared: undefined }), PNR, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const { snapshot } = out.result;
    expect(snapshot.train.depTime).toBeUndefined();
    expect(snapshot.train.from.city).toBeUndefined();
    expect(snapshot.train.distanceKm).toBeUndefined();
    expect(snapshot.chartPrepared).toBeUndefined();
    expect(snapshot.chartAt).toBeUndefined();
  });

  it("reads the camelCase variant, with coach and berth in their own fields", () => {
    const body = {
      data: {
        pnrNumber: PNR,
        trainNumber: "12658",
        trainName: "SBC MAS SF MAIL",
        dateOfJourney: "Sep 25, 2026 10:40:00 PM",
        sourceStation: "SBC",
        destinationStation: "MAS",
        journeyClass: "SL",
        quota: "TQ",
        chartStatus: "Chart Prepared",
        passengerList: [{ passengerSerialNumber: 1, bookingStatus: "TQWL/20", currentStatus: "CNF", currentCoachId: "S7", currentBerthNo: 12, currentBerthCode: "UB" }],
      },
    };
    const out = parseIrctc1Response(body, PNR, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.snapshot.chartPrepared).toBe(true);
    expect(out.result.snapshot.pax[0]).toEqual({ index: 1, bookingStatus: "WL", currentStatus: "CNF", coach: "S7", berth: "12 UB", quota: "TQWL" });
    expect(out.result.lead).toEqual({ status: "CNF", position: null, coach: "S7", berth: "12 UB", quota: "TQ" });
  });

  it.each([
    ["PNR No. is not valid", "NOT_FOUND"],
    ["Flushed PNR / PNR not yet generated", "NOT_FOUND"],
    ["Something went wrong", "SOURCE_UNAVAILABLE"],
  ] as const)("maps a refusal (%s) to %s", (message, code) => {
    const out = parseIrctc1Response({ status: false, message }, PNR, NOW);
    expect(out).toMatchObject({ ok: false, code });
  });

  it("reads the envelope the live API returned for an unknown PNR as Not found", () => {
    // Observed from irctc1.p.rapidapi.com on 2026-09-17: HTTP 200 with this body.
    const out = parseIrctc1Response({ status: false, message: "PNR Not found.", timestamp: 1789664000000 }, PNR, NOW);
    expect(out).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("fails closed when the record belongs to another PNR", () => {
    expect(parseIrctc1Response(pascal({ Pnr: "1111111111" }), PNR, NOW)).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });

  it.each([
    ["no passengers", { PassengerStatus: [] }],
    ["an unreadable seat status", { PassengerStatus: [{ Number: 1, BookingStatus: "GNWL/1", CurrentStatus: "NOSB" }] }],
    ["an unknown class", { Class: "ZZ" }],
    ["no journey date", { Doj: undefined }],
    ["a malformed train number", { TrainNo: "12A" }],
  ])("fails closed on %s", (_label, overrides) => {
    const out = parseIrctc1Response(pascal(overrides), PNR, NOW);
    expect(out).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });

  it.each([null, "text", [], { status: true }, { status: true, data: "x" }])("fails closed on an unreadable body (%j)", (body) => {
    expect(parseIrctc1Response(body, PNR, NOW)).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });
});
