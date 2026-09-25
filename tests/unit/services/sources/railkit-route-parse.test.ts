import { describe, expect, it } from "vitest";
import { messages } from "@/messages";
import { parseRailkitRouteResponse, readRunningDays } from "@/services/sources/railkit-route-parse";

// ---------------------------------------------------------------------------
// The trains-between parser, on the shape measured live on 2026-09-25 from
// GET /api/v1/trains/between/SBC/NDLS — an array of sixteen-field records.
//
// The load-bearing rule, inherited from the availability parser: an EMPTY list
// is an answer ("no trains run this pair"), never a refusal. The traveller acts
// on the difference, so each direction has its own test.
//
// The second rule is narrower and newer: running_days is a seven-character mask
// whose weekday order is NOT yet verified, so the parser reads it as seven flags
// and nothing more. A test pins that it does not claim a calendar.
// ---------------------------------------------------------------------------

const OUT = messages.source.outcomes;
const NOW = new Date("2026-09-25T06:30:00.000Z");

/** Field names and types verbatim from the measured response; values are of the measured shape. */
const TRAIN = {
  train_no: "12627",
  train_name: "KARNATAKA EXP",
  source_stn_name: "KSR BENGALURU",
  source_stn_code: "SBC",
  dstn_stn_name: "NEW DELHI",
  dstn_stn_code: "NDLS",
  from_stn_name: "KSR BENGALURU",
  from_stn_code: "SBC",
  to_stn_name: "NEW DELHI",
  to_stn_code: "NDLS",
  from_time: "20:00",
  to_time: "06:10",
  travel_time: "34:10 hrs",
  running_days: "1111111",
  distance: "2444",
  halts: 31,
};

const ok = (data: unknown) => ({ success: true, data });

describe("parseRailkitRouteResponse", () => {
  it("reads a train, keeping the segment and the train's own origin apart", () => {
    const out = parseRailkitRouteResponse(ok([TRAIN]), { from: "SBC", to: "NDLS" }, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const [train] = out.answer.trains;
    expect(train).toBeDefined();
    expect(train?.trainNo).toBe("12627");
    expect(train?.trainName).toBe("KARNATAKA EXP");
    expect(train?.fromCode).toBe("SBC");
    expect(train?.toName).toBe("NEW DELHI");
    expect(train?.originCode).toBe("SBC");
    expect(train?.destinationCode).toBe("NDLS");
    expect(train?.departs).toBe("20:00");
    expect(train?.travelTime).toBe("34:10 hrs");
    expect(train?.halts).toBe(31);
    expect(train?.distanceKm).toBe(2444);
    expect(out.answer.retrievedAt).toBe(NOW.toISOString());
  });

  it("answers with an empty list when no train runs the pair, and never as a failure", () => {
    const out = parseRailkitRouteResponse(ok([]), { from: "SBC", to: "XXXX" }, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.answer.trains).toEqual([]);
    expect(out.answer.from).toBe("SBC");
    expect(out.answer.to).toBe("XXXX");
  });

  it("refuses a body that is not the measured shape rather than reading it as no trains", () => {
    for (const body of [null, {}, { success: true }, ok({ trains: [] }), ok("none")]) {
      const out = parseRailkitRouteResponse(body, { from: "SBC", to: "NDLS" }, NOW);
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.code).toBe("SOURCE_UNAVAILABLE");
      expect(out.message).toBe(OUT.unreadable);
    }
  });

  it("drops a train with no number instead of inventing one, and keeps the rest", () => {
    const out = parseRailkitRouteResponse(ok([{ ...TRAIN, train_no: "" }, TRAIN]), { from: "SBC", to: "NDLS" }, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.answer.trains).toHaveLength(1);
  });

  it("keeps a train whose optional fields are missing, with nulls and no guesses", () => {
    const sparse = { train_no: "12628", train_name: "KARNATAKA EXP", from_stn_code: "NDLS", to_stn_code: "SBC" };
    const out = parseRailkitRouteResponse(ok([sparse]), { from: "NDLS", to: "SBC" }, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const [train] = out.answer.trains;
    expect(train?.departs).toBeNull();
    expect(train?.travelTime).toBeNull();
    expect(train?.runningDays).toBeNull();
    expect(train?.runsOn).toBeNull();
    expect(train?.halts).toBeNull();
    expect(train?.distanceKm).toBeNull();
  });
});

describe("readRunningDays", () => {
  it("reads a seven-character mask as seven flags", () => {
    expect(readRunningDays("1111111")).toEqual([true, true, true, true, true, true, true]);
    expect(readRunningDays("1101110")).toEqual([true, true, false, true, true, true, false]);
    expect(readRunningDays("YNYNYNY")).toEqual([true, false, true, false, true, false, true]);
  });

  it("returns null for anything that is not a seven-character mask, rather than a guess", () => {
    for (const value of ["", "111", "11111111", "Mon Tue", "1111112", null, 1111111]) {
      expect(readRunningDays(value)).toBeNull();
    }
  });
});
