import { describe, expect, it } from "vitest";
import { addDays, advanceCursor, coveredDates, cycleRuns, daysBetween, nextAsk, parseCursors } from "../../../scripts/crawl-window.mjs";

// ---------------------------------------------------------------------------
// The crawler asks each combo for ONE date a run, and rolls that date forward a stride a day.
// Everything that can go quietly wrong with a rolling window is here:
//
//   * a stride that leaves a blind spot — some calendar day no sweep ever asks for, which no
//     later run can fill, because a past date answers 400;
//   * a stride that overlaps — quota paid twice a run, forever;
//   * a cursor that drifts into the past, or past the horizon, and is never brought back;
//   * a cursor file read wrong, so the crawl resumes somewhere nobody chose.
//
// So the property is proved the way the dense stride was: by driving the real functions exactly as
// the crawler drives them, for a hundred and twenty simulated runs, and asserting both what is
// guaranteed and — just as important for a sample — what is not.
//
// No key, no network and no database is touched by anything below.
// ---------------------------------------------------------------------------

describe("nextAsk", () => {
  it("starts at today when a combo has no cursor yet", () => {
    expect(nextAsk({ cursor: undefined, today: "2026-09-24", horizonDays: 60, windowDays: 4 })).toEqual({ date: "2026-09-24", reset: "none" });
  });

  it("asks where the cursor left off", () => {
    expect(nextAsk({ cursor: "2026-10-02", today: "2026-09-24", horizonDays: 60, windowDays: 4 })).toEqual({ date: "2026-10-02", reset: "none" });
  });

  it("wraps back to today when the cursor passes the horizon, and says it wrapped", () => {
    expect(nextAsk({ cursor: "2026-11-30", today: "2026-09-24", horizonDays: 60, windowDays: 4 })).toEqual({ date: "2026-09-24", reset: "beyond" });
  });

  it("never asks a past date — a past date answers 400 and the day is lost for good", () => {
    expect(nextAsk({ cursor: "2026-09-01", today: "2026-09-24", horizonDays: 60, windowDays: 4 })).toEqual({ date: "2026-09-24", reset: "behind" });
  });

  it("treats a cursor it cannot read as no cursor at all, rather than guessing", () => {
    expect(nextAsk({ cursor: "24-09-2026", today: "2026-09-24", horizonDays: 60, windowDays: 4 })).toEqual({ date: "2026-09-24", reset: "unreadable" });
  });

  it("refuses a window of one day: the cursor would advance exactly as fast as today and never move out", () => {
    expect(() => nextAsk({ cursor: undefined, today: "2026-09-24", horizonDays: 60, windowDays: 1 })).toThrow(RangeError);
  });

  it.each([
    ["a horizon of zero", 0, 4],
    ["a fractional horizon", 6.5, 4],
    ["a negative window", 60, -1],
  ])("refuses %s rather than guessing", (_label, horizonDays, windowDays) => {
    expect(() => nextAsk({ cursor: undefined, today: "2026-09-24", horizonDays, windowDays })).toThrow(RangeError);
  });
});

describe("advanceCursor", () => {
  it("moves on by exactly one window, so the next ask begins where this one ended", () => {
    expect(advanceCursor("2026-09-24", 4)).toBe("2026-09-28");
  });

  it("crosses a month end and a leap day without drifting", () => {
    expect(advanceCursor("2028-02-26", 4)).toBe("2028-03-01");
  });
});

describe("cycleRuns", () => {
  it("is how many runs a sweep takes: the cursor gains window-minus-one days on today each run", () => {
    expect(cycleRuns(60, 4)).toBe(20);
  });

  it("gets LONGER, not shorter, as the window shrinks — which is why a smaller stride buys nothing", () => {
    expect(cycleRuns(60, 3)).toBe(30);
    expect(cycleRuns(60, 5)).toBe(15);
  });
});

/** One combo, one ask a day, for `runs` days — exactly what the crawler does, driven by its own functions. */
function sweep(runs: number, horizonDays = 60, windowDays = 4, from = "2026-09-24") {
  const asked: { day: number; today: string; date: string; reset: string }[] = [];
  let cursor: string | undefined;
  for (let day = 0; day < runs; day += 1) {
    const today = addDays(from, day);
    const { date, reset } = nextAsk({ cursor, today, horizonDays, windowDays });
    asked.push({ day, today, date, reset });
    cursor = advanceCursor(date, windowDays);
  }
  return asked;
}

describe("what the rolling window guarantees", () => {
  const runs = 120; // two full horizons at a sixty-day horizon
  const asked = sweep(runs);
  const covered = asked.map((a) => coveredDates([a.date], 4));

  it("never asks a date in the past", () => {
    for (const a of asked) expect(daysBetween(a.today, a.date), `run ${a.day}`).toBeGreaterThanOrEqual(0);
  });

  it("never asks beyond the horizon", () => {
    for (const a of asked) expect(daysBetween(a.today, a.date), `run ${a.day}`).toBeLessThanOrEqual(59);
  });

  it("leaves no calendar day unasked, from the first day it ran to the last day it reached", () => {
    const seen = new Set(covered.flat());
    const all = [...seen].sort();
    const first = all[0] as string;
    const last = all[all.length - 1] as string;
    for (let i = 0; i <= daysBetween(first, last); i += 1) {
      expect(seen, `${addDays(first, i)} was never asked for`).toContain(addDays(first, i));
    }
  });

  it("covers each calendar day exactly once per sweep — windows inside a sweep are contiguous, never overlapping", () => {
    let sweepDays: string[] = [];
    for (const a of asked) {
      if (a.reset !== "none") {
        expect(new Set(sweepDays).size, `a day was asked twice in one sweep ending at run ${a.day}`).toBe(sweepDays.length);
        sweepDays = [];
      }
      sweepDays.push(...coveredDates([a.date], 4));
    }
    expect(new Set(sweepDays).size).toBe(sweepDays.length);
  });

  it("takes cycleRuns runs to sweep the horizon, then wraps", () => {
    const wraps = asked.filter((a) => a.reset === "beyond").map((a) => a.day);
    expect(wraps).toEqual([20, 40, 60, 80, 100]);
    expect(wraps[0]).toBe(cycleRuns(60, 4));
  });

  it("sees one journey date several times, at decreasing distances from departure — which is the point of sampling sparsely", () => {
    // A date whose whole life inside the horizon falls within the simulation, and which entered it
    // while the crawler was already sweeping: the steady state, not the first days after a cold start.
    const journey = addDays("2026-09-24", 100);
    const seen = asked.filter((a, i) => covered[i]?.includes(journey)).map((a) => daysBetween(a.today, journey));

    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect([...seen].sort((a, b) => b - a)).toEqual(seen); // strictly decreasing
    expect(Math.min(...seen)).toBeLessThanOrEqual(3); // observed at or near departure: the outcome row
    expect(Math.max(...seen)).toBeGreaterThanOrEqual(44); // and once while it was still far off
  });

  it("does NOT promise a journey date at every distance — it is a sample, and this is the shape of it", () => {
    const journey = addDays("2026-09-24", 100);
    const seen = asked.filter((a, i) => covered[i]?.includes(journey)).map((a) => daysBetween(a.today, journey));

    // Four observations out of sixty possible distances. Gaps of about fifteen days between them.
    expect(seen.length).toBeLessThan(10);
    for (let i = 1; i < seen.length; i += 1) expect((seen[i - 1] as number) - (seen[i] as number)).toBeGreaterThan(10);
  });
});

describe("parseCursors", () => {
  it("reads a cursor file", () => {
    const parsed = parseCursors(JSON.stringify({ "12621 MAS-NDLS SL/GN": { next: "2026-10-02", refusals: 0 } }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.cursors["12621 MAS-NDLS SL/GN"]).toEqual({ next: "2026-10-02", refusals: 0 });
  });

  it("starts from nothing when there is no file yet", () => {
    const parsed = parseCursors(null);
    expect(parsed).toEqual({ ok: true, cursors: {} });
  });

  it.each([
    ["not an object", "[]"],
    ["not JSON at all", "{"],
    ["an entry that is not an object", JSON.stringify({ a: "2026-10-02" })],
    ["a next that is not an ISO date", JSON.stringify({ a: { next: "02-10-2026", refusals: 0 } })],
    ["a refusal count that is not a whole number", JSON.stringify({ a: { next: "2026-10-02", refusals: 1.5 } })],
  ])("refuses %s rather than crawling from a place it guessed", (_label, json) => {
    expect(parseCursors(json).ok).toBe(false);
  });
});
