import { describe, expect, it } from "vitest";
import { parseRailkitPnrResponse } from "@/services/sources/railkit-parse";
import { parseClockTime } from "@/services/sources/irctc-record";
import { toPublicResult } from "@/services/public-result";
import { pnrApiOkSchema, pnrResultSchema } from "@/types/schemas";

// Payload shape: RailKit's documented GET /api/v1/pnr/:pnr answer (README, v6). Confirm the live
// shape with `npm run source:probe:railkit` before relying on a new field.

const NOW = new Date("2026-08-21T06:30:00.000Z");
const PNR = "5827194603";

type Seat = { status: string | null; coach: string | null; berthNo: number | null; berthCode: string | null; details: string };

function seat(status: string | null, coach: string | null, berthNo: number | null, berthCode: string | null, details: string): Seat {
  return { status, coach, berthNo, berthCode, details };
}

function documented(overrides: { data?: Record<string, unknown>; journey?: Record<string, unknown>; passengers?: unknown[] } = {}) {
  return {
    success: true,
    data: {
      pnr: PNR,
      train: { number: "12987", name: "SAMPURN K RAJDHANI" },
      journey: {
        dateOfJourney: "22 Aug 2026, 04:35:00 pm",
        class: "3A",
        quota: "GN",
        source: { code: "JP", name: "JAIPUR JN" },
        destination: { code: "NDLS", name: "NEW DELHI" },
        boardingPoint: { code: "JP", name: "JAIPUR JN" },
        distance: 471,
        arrivalDate: "22 Aug 2026, 10:20:00 pm",
        ...overrides.journey,
      },
      chart: { status: "Chart Prepared" },
      booking: { fare: 1845, ticketFare: 1795, bookingDate: "20 Aug 2026, 11:14:32 am" },
      passengers: overrides.passengers ?? [
        {
          serialNumber: "Passenger 1",
          coachPosition: 0,
          booking: seat("CNF", "B5", 22, "LB", "CNF/B5/22/LB"),
          current: seat("CNF", "B5", 22, "LB", "CNF , B5 - 22 [LB]"),
        },
        {
          serialNumber: "Passenger 2",
          coachPosition: 0,
          booking: seat("RAC", null, 7, null, "RAC/7"),
          current: seat("CNF", "B5", 31, "UB", "CNF , B5 - 31 [UB]"),
        },
      ],
      ...overrides.data,
    },
  };
}

function passenger(booking: Seat, current: Seat, serialNumber = "Passenger 1") {
  return { serialNumber, coachPosition: 0, booking, current };
}

describe("parseClockTime", () => {
  it.each([
    ["22 Aug 2026, 04:35:00 pm", "16:35"],
    ["22 Aug 2026, 12:05:00 am", "00:05"],
    ["22 Aug 2026, 12:40:00 pm", "12:40"],
    ["2026-08-22T09:15", "09:15"],
    ["16:35", "16:35"],
  ])("reads %s as %s", (raw, expected) => {
    expect(parseClockTime(raw)).toBe(expected);
  });

  it.each(["22 Aug 2026", "25:10", "13:00 pm", "4:75 pm", ""])("refuses %s", (raw) => {
    expect(parseClockTime(raw)).toBeNull();
  });
});

describe("parseRailkitPnrResponse", () => {
  it("maps the documented record into one labelled with its third-party source", () => {
    const out = parseRailkitPnrResponse(documented(), PNR, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const { snapshot, lead } = out.result;
    expect(snapshot.source).toBe("railkit");
    expect(snapshot.pnr).toBe(PNR);
    expect(snapshot.train).toEqual({
      number: "12987",
      name: "SAMPURN K RAJDHANI",
      from: { code: "JP", city: "JAIPUR JN" },
      to: { code: "NDLS", city: "NEW DELHI" },
      depTime: "16:35",
      distanceKm: 471,
    });
    expect(snapshot.cls).toBe("3A");
    expect(snapshot.journeyDate).toBe("2026-08-22");
    expect(snapshot.chartPrepared).toBe(true);
    expect(snapshot.passengerCount).toBe(2);
    expect(snapshot.pax).toEqual([
      { index: 1, bookingStatus: "CNF", currentStatus: "CNF", coach: "B5", berth: "22 LB", quota: "GN" },
      { index: 2, bookingStatus: "RAC", currentStatus: "CNF", coach: "B5", berth: "31 UB", quota: "GN" },
    ]);
    expect(lead).toEqual({ status: "CNF", position: null, coach: "B5", berth: "22 LB", quota: "GN" });
    expect(out.result.checkedAt).toBe(NOW.toISOString());
  });

  it("produces records the wire contract accepts, so the browser renders them", () => {
    const out = parseRailkitPnrResponse(documented(), PNR, NOW);
    if (!out.ok) throw new Error("expected a record");
    const shown = toPublicResult(out.result);
    expect(shown.snapshot.source).toBe("live");
    expect(pnrResultSchema.safeParse(shown).success).toBe(true);
    const wire = { ok: true, source: "live", cached: false, latencyMs: 5, rate: { remaining: 19, limit: 20 }, data: shown };
    expect(pnrApiOkSchema.safeParse(wire).success).toBe(true);
    // The wire contract refuses a provider name: a missed mapping fails closed in the browser.
    expect(pnrApiOkSchema.safeParse({ ...wire, source: "railkit", data: out.result }).success).toBe(false);
  });

  it("never carries the fare, booking time or any prediction", () => {
    const out = parseRailkitPnrResponse(documented(), PNR, NOW);
    if (!out.ok) throw new Error("expected a record");
    const serialised = JSON.stringify(out.result);
    expect(serialised).not.toContain("1845");
    expect(serialised).not.toContain("11:14");
    expect(out.result.prediction).toBeUndefined();
    expect(out.result.snapshot.pax.every((p) => p.name === undefined)).toBe(true);
  });

  it("reads waitlist positions and the quota a waitlist code names", () => {
    const out = parseRailkitPnrResponse(
      documented({
        journey: { quota: "PT" },
        passengers: [
          passenger(seat("GNWL", null, 45, null, "GNWL/45"), seat("GNWL", null, 12, null, "GNWL/12")),
          passenger(seat("PQWL", null, 9, null, "PQWL/9"), seat("WL", null, 3, null, "WL/3"), "Passenger 2"),
        ],
      }),
      PNR,
      NOW,
    );
    if (!out.ok) throw new Error("expected a record");
    expect(out.result.snapshot.pax).toEqual([
      { index: 1, bookingStatus: "WL", currentStatus: "WL", position: 12, quota: "GN" },
      { index: 2, bookingStatus: "WL", currentStatus: "WL", position: 3, quota: "PQWL" },
    ]);
    expect(out.result.lead).toEqual({ status: "WL", position: 12, quota: "PT" });
  });

  it("reads RAC with a position before the chart and a berth after it, and cancellations", () => {
    const out = parseRailkitPnrResponse(
      documented({
        passengers: [
          passenger(seat("RAC", null, 14, null, "RAC/14"), seat("RAC", null, 7, null, "RAC 7")),
          passenger(seat("RAC", null, 15, null, "RAC/15"), seat("RAC", "S4", 33, "SL", "RAC , S4 - 33 [SL]"), "Passenger 2"),
          passenger(seat("CNF", "B1", 9, "UB", "CNF/B1/9/UB"), seat("CAN", null, null, null, "CAN"), "Passenger 3"),
        ],
      }),
      PNR,
      NOW,
    );
    if (!out.ok) throw new Error("expected a record");
    expect(out.result.snapshot.pax).toEqual([
      { index: 1, bookingStatus: "RAC", currentStatus: "RAC", position: 7, quota: "GN" },
      { index: 2, bookingStatus: "RAC", currentStatus: "RAC", coach: "S4", berth: "33 SL", quota: "GN" },
      { index: 3, bookingStatus: "CNF", currentStatus: "CANCELLED", quota: "GN" },
    ]);
  });

  it("falls back to the details string when the structured status is missing", () => {
    const out = parseRailkitPnrResponse(
      documented({ passengers: [passenger(seat(null, null, null, null, "CNF/B5/22/LB"), seat(null, null, null, null, "CNF , B5 - 22 [LB]"))] }),
      PNR,
      NOW,
    );
    if (!out.ok) throw new Error("expected a record");
    expect(out.result.snapshot.pax[0]).toEqual({ index: 1, bookingStatus: "CNF", currentStatus: "CNF", coach: "B5", berth: "22 LB", quota: "GN" });
  });

  it("reads a chart that is not prepared, and leaves unsent fields unset instead of estimating them", () => {
    const body = documented({ journey: { dateOfJourney: "22 Aug 2026", distance: undefined } });
    const withoutExtras = {
      ...body,
      data: { ...body.data, train: { number: "12987" }, chart: { status: "Chart Not Prepared" } },
    };
    const out = parseRailkitPnrResponse(withoutExtras, PNR, NOW);
    if (!out.ok) throw new Error("expected a record");
    expect(out.result.snapshot.chartPrepared).toBe(false);
    expect(out.result.snapshot.train).toEqual({ number: "12987", from: { code: "JP", city: "JAIPUR JN" }, to: { code: "NDLS", city: "NEW DELHI" } });
    expect(out.result.snapshot.chartTime).toBeUndefined();
    expect(out.result.hoursToChart).toBeUndefined();
  });

  it.each([
    ["No PNR data found or invalid PNR number"],
    ["PNR not found"],
    ["Flushed PNR / PNR not yet generated"],
    ["Invalid PNR number"],
  ])("reads the refusal %j as no record", (error) => {
    expect(parseRailkitPnrResponse({ success: false, error }, PNR, NOW)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it.each([["Request timed out"], ["Upstream service unavailable"], ["Invalid date format. Use DD-MM-YYYY."], [""]])("reads the refusal %j as unavailable", (error) => {
    expect(parseRailkitPnrResponse({ success: false, error }, PNR, NOW)).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });

  it("fails closed when the record belongs to another PNR", () => {
    const out = parseRailkitPnrResponse(documented({ data: { pnr: "1111111111" } }), PNR, NOW);
    expect(out).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });

  it.each([
    ["an unknown seat status", documented({ passengers: [passenger(seat("NOSB", null, null, null, "NOSB"), seat("NOSB", null, null, null, "NOSB"))] })],
    ["an unknown class", documented({ journey: { class: "ZZ" } })],
    ["an unreadable journey date", documented({ journey: { dateOfJourney: "tomorrow" } })],
    ["a malformed train number", documented({ data: { train: { number: "12A87" } } })],
    ["a station without a code", documented({ journey: { destination: { name: "NEW DELHI" } } })],
    ["no passengers", documented({ passengers: [] })],
    ["no data", { success: true }],
    ["a non-object body", "<html>"],
    ["an envelope without success", { data: {} }],
  ])("fails closed on %s", (_label, body) => {
    expect(parseRailkitPnrResponse(body, PNR, NOW)).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });
});
