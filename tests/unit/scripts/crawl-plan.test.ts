import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_MAX_CALLS_PER_RUN,
  ASKS_PER_COMBO_MAX,
  CALLS_PER_ASK_MAX,
  DEFAULT_DAILY_ALLOWANCE,
  comboKey,
  crawlCeiling,
  planAsks,
  plannedCalls,
  remainingVerdict,
} from "../../../scripts/crawl-plan.mjs";
import { addDays, advanceCursor, coveredDates, daysBetween } from "../../../scripts/crawl-window.mjs";

// ---------------------------------------------------------------------------
// `npm run source:crawl` fills the observation store. Three things in its plan are load-bearing,
// and all three are testable without a network, so all three are pinned here. The rolling window
// that decides WHICH date each combo asks for has its own file beside this one;
// `scripts/crawl-availability.mjs` is only the wiring around both.
//
//   1. The gate. A spent plan answers 429; a 429 rests every caller of the provider, including
//      live PNR checks, whose fallback is `none`. So the run must be unable to reach the plan's
//      floor, and must stop — never slow — at its own ceiling.
//   2. The outcome row. `days_out = 0` is the label a model trains against, and the rolling window
//      alone reaches it for one journey date in twenty. The pinned ask that fixes that is proved
//      here, over every journey date in the steady state.
//
// The loop that spends them is `crawl-run.test.ts`, the route list and its preflight are
// `crawl-routes.test.ts`, and what a run SAYS about itself is `crawl-report.test.ts`.
//
// No key, no network and no database is touched by anything below.
// ---------------------------------------------------------------------------

/** A shape the parser accepts, so each test can spoil exactly one field. */
function route(over: Partial<Record<string, string>> = {}) {
  return { trainNo: "12621", from: "MAS", to: "NDLS", travelClass: "SL", quota: "GN", ...over };
}

// ---------------------------------------------------------------------------
// 1b. The outcome row. `days_out = 0` is what the migration calls the outcome —
//     the label a model trains against — and the rolling window alone reaches it
//     for one journey date in `cycleRuns`, because `nextAsk` returns today only
//     when a sweep wraps and the phase locks on the first run. So every combo
//     also gets a second ask PINNED at today, and this is where that is proved:
//     over every journey date in the steady state, not one phase-aligned date.
// ---------------------------------------------------------------------------

/**
 * Drives the real plan for `runs` daily runs of one combo, exactly as the crawler drives it, and
 * returns for each journey date every distance from departure at which it was observed.
 */
function observeDaily(runs: number, { horizonDays = 60, windowDays = 4, from = "2026-09-24" } = {}) {
  const routes = [route()];
  const key = comboKey(routes[0] as never);
  let cursors: Record<string, { next: string; refusals: number }> = {};
  const seen = new Map<string, number[]>();

  for (let day = 0; day < runs; day += 1) {
    const today = addDays(from, day);
    for (const step of planAsks({ routes, cursors, today, horizonDays, windowDays })) {
      for (const date of coveredDates([step.date], windowDays)) {
        seen.set(date, [...(seen.get(date) ?? []), daysBetween(today, date)]);
      }
      // Only the rolling ask moves the cursor. The pinned one is a second look at today.
      if (step.kind === "rolling") cursors = { [key]: { next: advanceCursor(step.date, windowDays), refusals: 0 } };
    }
  }
  return seen;
}

/** Journey dates whose whole life inside the horizon falls within the simulation: the steady state. */
function steadyState(seen: Map<string, number[]>, runs: number, { horizonDays = 60, from = "2026-09-24" } = {}) {
  return [...seen.keys()].filter((date) => {
    const offset = daysBetween(from, date);
    return offset >= horizonDays && offset <= runs - 1;
  });
}

describe("the outcome row", () => {
  const RUNS = 200;
  const seen = observeDaily(RUNS);
  const dates = steadyState(seen, RUNS);

  it("has a steady state worth asserting over — not one phase-aligned date", () => {
    expect(dates.length).toBeGreaterThan(100);
  });

  it("gives EVERY journey date in the steady state a days_out = 0 row, which is the label a model trains against", () => {
    const without = dates.filter((date) => !(seen.get(date) ?? []).includes(0));
    expect(
      without.length,
      `${without.length} of ${dates.length} journey dates never got a days_out = 0 row; the first few are ${without.slice(0, 4).join(", ")}`,
    ).toBe(0);
  });

  it("still sees every journey date several times before departure, at decreasing distances", () => {
    for (const date of dates) {
      const distances = seen.get(date) ?? [];
      expect(distances.length, date).toBeGreaterThanOrEqual(4);
      expect([...distances].sort((a, b) => b - a), date).toEqual(distances);
    }
  });

  it("sees one of them far out too, so the sequence spans the horizon rather than crowding departure", () => {
    for (const date of dates) expect(Math.max(...(seen.get(date) ?? [])), date).toBeGreaterThanOrEqual(44);
  });
});

// ---------------------------------------------------------------------------
// 3. The gate. This is the requirement the task turns on.
// ---------------------------------------------------------------------------

describe("crawlCeiling", () => {
  it("is the day's plan less what live checks are allowed to spend", () => {
    expect(crawlCeiling({ dailyAllowance: 333, liveReserve: 300 }).ceiling).toBe(33);
  });

  it("is zero when live checks are allowed the whole plan — and says why", () => {
    const verdict = crawlCeiling({ dailyAllowance: 300, liveReserve: 300 });
    expect(verdict.ceiling).toBe(0);
    expect(verdict.reason).toMatch(/reserve/i);
  });

  it("never goes negative when the reserve is larger than the plan", () => {
    expect(crawlCeiling({ dailyAllowance: 100, liveReserve: 300 }).ceiling).toBe(0);
  });

  it("lets an operator ask for less", () => {
    expect(crawlCeiling({ dailyAllowance: 333, liveReserve: 300, requested: 8 }).ceiling).toBe(8);
  });

  it("does not let an operator ask for more: a ceiling a flag can raise is not a ceiling", () => {
    expect(crawlCeiling({ dailyAllowance: 333, liveReserve: 300, requested: 1000 }).ceiling).toBe(33);
  });

  it("caps an absurd plan at the absolute per-run maximum, so a mistyped flag cannot free the run", () => {
    expect(crawlCeiling({ dailyAllowance: 10_000_000, liveReserve: 0 }).ceiling).toBe(ABSOLUTE_MAX_CALLS_PER_RUN);
  });

  it("never lets one run be worth more than a day of the plan — a backstop above the thing it backstops is not one", () => {
    // It was 500: 1.5× the whole daily plan, and 15× the 33/day the design reserves for crawling.
    expect(ABSOLUTE_MAX_CALLS_PER_RUN).toBe(DEFAULT_DAILY_ALLOWANCE);
  });

  it("does not let a stray zero in --daily raise the ceiling: the flag describes the plan, it does not decide it", () => {
    const typo = crawlCeiling({ dailyAllowance: 3330, liveReserve: 300 });
    const meant = crawlCeiling({ dailyAllowance: 333, liveReserve: 300 });

    // Before: headroom 3330 - 300 = 3030, capped at 500, and the run could spend 500 calls.
    expect(typo.ceiling).toBe(meant.ceiling);
    expect(typo.ceiling).toBe(33);
  });

  it("says out loud that it ignored the flag, rather than clamping in silence", () => {
    expect(crawlCeiling({ dailyAllowance: 3330, liveReserve: 300 }).reason).toMatch(/--daily 3330 ignored/);
    expect(crawlCeiling({ dailyAllowance: 333, liveReserve: 300 }).reason).not.toMatch(/ignored/);
  });

  it("still lets --daily state a SMALLER plan, which is the honest direction for it to move", () => {
    expect(crawlCeiling({ dailyAllowance: 310, liveReserve: 300 }).ceiling).toBe(10);
  });

  it("leaves --reserve as the deliberate way to widen the gate, up to a day of the plan", () => {
    expect(crawlCeiling({ dailyAllowance: 333, liveReserve: 0 }).ceiling).toBe(DEFAULT_DAILY_ALLOWANCE);
  });
});

describe("plannedCalls", () => {
  it("counts the worst case: every ask a combo can make, and the one retry the guard allows each", () => {
    expect(plannedCalls({ combos: 6 })).toBe(6 * ASKS_PER_COMBO_MAX * CALLS_PER_ASK_MAX);
  });

  it("knows the guard retries a check at most once", () => {
    expect(CALLS_PER_ASK_MAX).toBe(2);
  });

  it("counts BOTH asks a combo makes — the rolling window and the pinned outcome row", () => {
    // The ceiling is only a ceiling if the arithmetic it is given tells it the truth. Counting one
    // ask per combo would let a run be waved through at half its real worst case.
    expect(ASKS_PER_COMBO_MAX).toBe(2);
    expect(plannedCalls({ combos: 6 })).toBe(24);
  });

  it("makes eight combos the most a default ceiling of 33 affords, and the shipped six comfortable", () => {
    expect(plannedCalls({ combos: 6 })).toBeLessThanOrEqual(crawlCeiling({ dailyAllowance: 333, liveReserve: 300 }).ceiling);
    expect(plannedCalls({ combos: 8 })).toBeLessThanOrEqual(33);
    expect(plannedCalls({ combos: 9 })).toBeGreaterThan(33);
  });
});

describe("remainingVerdict", () => {
  it("stops the run when the provider says its own allowance is down to the floor", () => {
    expect(remainingVerdict("50", 50).stop).toBe(true);
  });

  it("keeps going while the provider says there is room", () => {
    expect(remainingVerdict("540", 50).stop).toBe(false);
  });

  it("does not stop on a header the provider did not send — it cannot gate on what it does not know", () => {
    expect(remainingVerdict(null, 50)).toEqual({ known: false, remaining: null, stop: false });
  });

  it("does not stop on a header it cannot read", () => {
    expect(remainingVerdict("plenty", 50).stop).toBe(false);
  });
});
