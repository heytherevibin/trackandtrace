import { describe, expect, it } from "vitest";
import { affordablePrefix, plannedCalls } from "../../../scripts/crawl-plan.mjs";
import { dayBudgetLines, overBudgetRefusal } from "../../../scripts/crawl-report.mjs";

// ---------------------------------------------------------------------------
// The DAY gate, in the two places it is visible to an operator: the arithmetic
// that says how much of the list still fits, and the words a refused run prints.
//
// The consequence this file exists to keep honest: once a full run has happened,
// a second run the same day REFUSES, because 28 worst-case calls will not fit in
// what is left. That is correct for a crawler meant to run once a day — and it
// also blocks a legitimate retry after a run a gate cut short. `--only` narrows
// the list, so a shorter run may well fit, and the refusal has to say so with
// the arithmetic. An operator who meets a wall with no door in it widens
// `--reserve` instead, which is the one flag that leaves live PNR checks
// unprotected.
//
// Nothing here touches a network, a database or a clock.
// ---------------------------------------------------------------------------

function route(over: Partial<Record<string, string>> = {}) {
  return { trainNo: "12621", from: "MAS", to: "NDLS", travelClass: "SL", quota: "GN", ...over };
}

/** The shipped list's shape: six combos that make two asks, two Tatkal ones that make a single pinned ask. */
const SHIPPED = [
  route({ trainNo: "12301", from: "HWH", travelClass: "3A" }),
  route({ trainNo: "12301", from: "HWH", travelClass: "2A", quota: "TQ" }),
  route(),
  route({ trainNo: "12627", from: "SBC", quota: "TQ" }),
  route({ trainNo: "12137", from: "CSMT", travelClass: "3A" }),
  route({ trainNo: "12051", from: "DR", to: "MAO", travelClass: "2S" }),
  route({ trainNo: "12123", from: "CSMT", to: "PUNE", travelClass: "CC" }),
  route({ trainNo: "12621", from: "BPL" }),
];

describe("affordablePrefix", () => {
  it("is the whole list when the whole list fits", () => {
    expect(affordablePrefix({ routes: SHIPPED, ceiling: 28 })).toBe(SHIPPED.length);
  });

  // `--only n` slices the FIRST n entries, so the prefix is the only shape of
  // shorter run the flag can actually produce. Counting combos that fit in any
  // order would name a run the operator cannot ask for.
  it("counts a PREFIX of the list, because that is all --only can select", () => {
    const four = affordablePrefix({ routes: SHIPPED, ceiling: plannedCalls({ routes: SHIPPED.slice(0, 4) }) });

    expect(four).toBe(4);
  });

  it("charges a pinned-only combo one ask, as the planner does", () => {
    // Entry 2 is Tatkal: one ask, two calls. So the first two combos cost 4 + 2.
    expect(plannedCalls({ routes: SHIPPED.slice(0, 2) })).toBe(6);
    expect(affordablePrefix({ routes: SHIPPED, ceiling: 6 })).toBe(2);
    expect(affordablePrefix({ routes: SHIPPED, ceiling: 5 })).toBe(1);
  });

  it("is zero when not even the first combo fits, rather than rounding up to one", () => {
    expect(affordablePrefix({ routes: SHIPPED, ceiling: 3 })).toBe(0);
    expect(affordablePrefix({ routes: SHIPPED, ceiling: 0 })).toBe(0);
  });

  it("never names a prefix that costs more than the ceiling", () => {
    for (let ceiling = 0; ceiling <= 30; ceiling += 1) {
      const n = affordablePrefix({ routes: SHIPPED, ceiling });
      expect(plannedCalls({ routes: SHIPPED.slice(0, n) })).toBeLessThanOrEqual(ceiling);
    }
  });
});

const DAY = { dailyCap: 33, spentToday: 28, remainingToday: 5, limitedByDay: true };

describe("overBudgetRefusal", () => {
  it("names the day as the constraint when the day is what refuses, not the run's own ceiling", () => {
    const message = overBudgetRefusal({ worstCase: 28, ceiling: 5, routes: SHIPPED, day: DAY });

    expect(message).toMatch(/28 calls/);
    expect(message).toMatch(/today/i);
    expect(message).toMatch(/28 of (its |today's )?33/);
    expect(message).toMatch(/5 left|leaving 5/);
  });

  // The whole point of this message. Without it an operator whose run was cut
  // short by a gate meets a refusal with no way past it but --reserve, which is
  // the flag that leaves live PNR checks unprotected.
  it("names --only and the arithmetic, so a refused retry has a door in it", () => {
    const message = overBudgetRefusal({ worstCase: 28, ceiling: 5, routes: SHIPPED, day: DAY });

    expect(message).toContain("--only 1");
    expect(message).toMatch(/4 calls/);
  });

  it("says --only takes the FIRST n in file order, because it cannot pick which combos to retry", () => {
    const message = overBudgetRefusal({ worstCase: 28, ceiling: 5, routes: SHIPPED, day: DAY });

    expect(message).toMatch(/first/i);
    expect(message).toMatch(/order/i);
  });

  it("says plainly that nothing fits when nothing does, instead of naming `--only 0`", () => {
    const message = overBudgetRefusal({ worstCase: 28, ceiling: 2, routes: SHIPPED, day: { dailyCap: 33, spentToday: 31, remainingToday: 2, limitedByDay: true } });

    expect(message).not.toContain("--only 0");
    expect(message).toMatch(/not even|nothing fits/i);
  });

  it("offers --reserve, and says what widening the gate leaves unprotected", () => {
    const message = overBudgetRefusal({ worstCase: 28, ceiling: 5, routes: SHIPPED, day: DAY });

    expect(message).toContain("--reserve");
    expect(message).toMatch(/unprotected/);
  });

  it("says nothing was asked, because nothing was", () => {
    expect(overBudgetRefusal({ worstCase: 28, ceiling: 5, routes: SHIPPED, day: DAY })).toMatch(/[Nn]othing was asked/);
  });

  // The run's own ceiling still refuses on a day nothing has been spent on —
  // a list too big for the per-run gate. The message must not blame the day.
  it("blames the run's own ceiling when the day is not the binding constraint", () => {
    const message = overBudgetRefusal({ worstCase: 28, ceiling: 10, routes: SHIPPED, day: { dailyCap: 33, spentToday: 0, remainingToday: 33, limitedByDay: false } });

    expect(message).toMatch(/ceiling/);
    expect(message).not.toMatch(/already (been )?spent today|already cost/i);
    expect(message).toContain("--only");
  });
});

describe("dayBudgetLines", () => {
  it("prints what the day has already spent and what is left, which a --dry-run most needs", () => {
    const printed = dayBudgetLines({ today: "2026-09-24", dailyCap: 33, spentToday: 23, remainingToday: 10, reason: "10 calls: 10 left of today's 33" }).join("\n");

    expect(printed).toContain("23");
    expect(printed).toContain("33");
    expect(printed).toContain("10");
    expect(printed).toContain("2026-09-24");
  });

  it("says the day is IST, the same boundary the observations are bucketed by", () => {
    expect(dayBudgetLines({ today: "2026-09-24", dailyCap: 33, spentToday: 0, remainingToday: 33, reason: "" }).join("\n")).toMatch(/IST/);
  });
});
