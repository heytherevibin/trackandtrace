import { describe, expect, it } from "vitest";
import { parseJourneyDate, parseSeatStatus } from "@/services/sources/irctc-record";

// ---------------------------------------------------------------------------
// The two readers every Indian-rail provider's answer goes through.
// ---------------------------------------------------------------------------
// These live in `irctc-record.ts` and always have. They were only ever tested through
// `rapidapi-parse.ts`, which re-exported them — so removing RapidAPI deleted the only direct
// coverage of two functions RailKit depends on, and the suite stayed green because nothing was
// left to notice. That is the failure mode of a removal: not code that breaks, but a rule that
// stops being checked while remaining true.
//
// Both still feed live code. `parseSeatStatus` reads every passenger's booking status in
// `railkit-parse.ts`; `parseJourneyDate` decides the `journey_date` that
// `railkit-availability-parse.ts` writes into the observation store. **A malformed date read as a
// real one would put a journey that does not exist into a dataset a model will be fitted to**, and
// a past date can never be re-asked — which is why `31-02-2026` and `2026-13-01` matter more here
// than they look.
//
// Re-pointed from `tests/unit/services/sources/rapidapi-parse.test.ts` at 8393280, assertions
// unchanged.
// ---------------------------------------------------------------------------

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

  // A day that does not exist and a month that does not exist. Both are shaped like dates, and a
  // reader that trusted the shape would hand a fiction to the observation store.
  it.each(["", "31-02-2026", "tomorrow", "2026-13-01"])("refuses %s", (raw) => {
    expect(parseJourneyDate(raw)).toBeNull();
  });
});
