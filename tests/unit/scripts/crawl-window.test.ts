import { describe, expect, it } from "vitest";
import { addDays, advanceCursor, coveredDates, cursorsForRun, cycleRuns, daysBetween, isIsoDate, nextAsk, parseCursors } from "../../../scripts/crawl-window.mjs";

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

  /**
   * Every journey date whose whole life inside the horizon falls within the simulation, with the
   * distances from departure at which the rolling window saw it. The steady state — not one date,
   * and not the first days after a cold start.
   *
   * The old version of these two tests picked `addDays(from, 100)`, a date at offset 100: an exact
   * multiple of `cycleRuns(60, 4) = 20`, and therefore the one residue in twenty where the sweep
   * wraps onto it and `days_out = 0` happens to occur. One phase-aligned date is not the population,
   * and a bound of `≤ 3` is not `=== 0` — so the assertion held while 133 dates in 140 got no
   * outcome row at all. Assert over all of them, or assert nothing.
   */
  const steadyState = (() => {
    const seen = new Map<string, number[]>();
    asked.forEach((a, i) => {
      for (const date of covered[i] ?? []) seen.set(date, [...(seen.get(date) ?? []), daysBetween(a.today, date)]);
    });
    return [...seen.entries()].filter(([date]) => {
      const offset = daysBetween("2026-09-24", date);
      return offset >= 60 && offset <= runs - 1;
    });
  })();

  it("sees EVERY journey date in the steady state several times, at decreasing distances from departure", () => {
    expect(steadyState.length).toBeGreaterThan(50);
    for (const [date, seen] of steadyState) {
      expect(seen.length, date).toBeGreaterThanOrEqual(4);
      expect([...seen].sort((a, b) => b - a), date).toEqual(seen); // strictly decreasing
      expect(Math.max(...seen), date).toBeGreaterThanOrEqual(44); // and once while it was still far off
    }
  });

  it("does NOT promise a journey date at every distance — it is a sample, and this is the shape of it", () => {
    for (const [date, seen] of steadyState) {
      // Four observations out of sixty possible distances. Gaps of about fifteen days between them.
      expect(seen.length, date).toBeLessThan(10);
      for (let i = 1; i < seen.length; i += 1) expect((seen[i - 1] as number) - (seen[i] as number), date).toBeGreaterThan(10);
    }
  });

  it("does NOT reach days_out = 0 on its own — the outcome row needs the pinned ask, and this is the gap it fills", () => {
    // The correction this file's header records. `nextAsk` returns today only on the `beyond` wrap,
    // so the outcome row falls to one journey date in `cycleRuns(60, 4)` and the phase never drifts.
    // The pinned ask that fixes it lives in `crawl-plan.mjs`; it is proved in that file's tests.
    const withOutcome = steadyState.filter(([, seen]) => seen.includes(0));
    expect(withOutcome.length).toBeGreaterThan(0);
    expect(withOutcome.length).toBeLessThan(steadyState.length / 10);

    // And the starved residue is starved for ever, not merely unlucky in this window.
    const worst = Math.max(...steadyState.map(([, seen]) => Math.min(...seen)));
    expect(worst).toBe(15);
  });
});

describe("isIsoDate", () => {
  it("accepts a calendar-valid ISO date", () => {
    expect(isIsoDate("2026-09-24")).toBe(true);
  });

  it.each([
    ["the provider's own DD-MM-YYYY, which is the likeliest thing to type into --start", "24-09-2026"],
    ["a bare flag, which the arg parser stores as the string true", "true"],
    ["a day that does not exist", "2026-02-30"],
    ["nothing at all", ""],
  ])("refuses %s", (_label, value) => {
    expect(isIsoDate(value)).toBe(false);
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

// ---------------------------------------------------------------------------
// `--start`: a one-off override that must not cost anything it was not pointed at
// ---------------------------------------------------------------------------
// It used to rebuild the whole cursor map from the `--only`-cut route list, and the run then wrote
// that map over the file. `npm run source:crawl -- --start 2026-11-01 --only 2` — the natural way
// to test one change against two combos — therefore deleted combos 3..6 entirely. The next ordinary
// run found no entry for them, which takes `reset: "none"` rather than `behind`, so nothing landed
// in `restarted` and the run printed "The run was whole" and exited 0 over four restarted sweeps.

describe("cursorsForRun", () => {
  const STORED = {
    "12621 MAS-NDLS SL/GN": { next: "2026-10-02", refusals: 0 },
    "12301 HWH-NDLS 3A/GN": { next: "2026-10-14", refusals: 2 },
    "12051 DR-MAO 2S/GN": { next: "2026-11-30", refusals: 1 },
  };

  it("is exactly the stored map when there is no override", () => {
    expect(cursorsForRun({ stored: STORED, keys: Object.keys(STORED), startAt: undefined })).toEqual(STORED);
  });

  it("points the combos this run is about at the date it was given", () => {
    const cursors = cursorsForRun({ stored: STORED, keys: ["12621 MAS-NDLS SL/GN"], startAt: "2026-11-01" });
    expect(cursors["12621 MAS-NDLS SL/GN"]).toEqual({ next: "2026-11-01", refusals: 0 });
  });

  it("KEEPS every combo the override was not pointed at, which --only used to erase", () => {
    const cursors = cursorsForRun({ stored: STORED, keys: ["12621 MAS-NDLS SL/GN"], startAt: "2026-11-01" });

    expect(cursors["12301 HWH-NDLS 3A/GN"]).toEqual({ next: "2026-10-14", refusals: 2 });
    expect(cursors["12051 DR-MAO 2S/GN"]).toEqual({ next: "2026-11-30", refusals: 1 });
  });

  it("keeps a combo that has left the route list entirely, exactly as a run that never reaches one does", () => {
    // A combo taken off `routes.json` for a day must not lose its place; `runCrawl` already holds
    // the cursor of a combo it never reaches, and this is the same promise for the same reason.
    const cursors = cursorsForRun({ stored: STORED, keys: ["12621 MAS-NDLS SL/GN", "unlisted 99999 A-B SL/GN"], startAt: "2026-11-01" });
    expect(Object.keys(cursors).sort()).toEqual([...Object.keys(STORED), "unlisted 99999 A-B SL/GN"].sort());
  });

  it("carries the combo's own refusal count across the override, rather than forgiving it", () => {
    const cursors = cursorsForRun({ stored: STORED, keys: ["12301 HWH-NDLS 3A/GN"], startAt: "2026-11-01" });
    expect(cursors["12301 HWH-NDLS 3A/GN"]).toEqual({ next: "2026-11-01", refusals: 2 });
  });

  it("starts a combo with no stored entry at zero refusals", () => {
    const cursors = cursorsForRun({ stored: {}, keys: ["12621 MAS-NDLS SL/GN"], startAt: "2026-11-01" });
    expect(cursors["12621 MAS-NDLS SL/GN"]).toEqual({ next: "2026-11-01", refusals: 0 });
  });

  it("does not mutate the map it was handed", () => {
    const stored = { ...STORED };
    cursorsForRun({ stored, keys: ["12621 MAS-NDLS SL/GN"], startAt: "2026-11-01" });
    expect(stored).toEqual(STORED);
  });
});
