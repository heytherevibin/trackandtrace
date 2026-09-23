import { describe, expect, it } from "vitest";
import { addDays } from "../../../scripts/crawl-window.mjs";
import { DEFAULT_MIN_COVERAGE_PCT, coverageReport, exitCodeFor, missingRanges, parseObservationRows, readObservations, summariseCoverage } from "../../../scripts/observations-coverage.mjs";

// ---------------------------------------------------------------------------
// The rule behind `npm run source:report`: where the observation store is holed. A hole here is
// permanent: a past journey date answers `400 Failed to fetch availability`, so a day nobody
// crawled is a day the dataset never gets.
//
// WHAT COUNTS AS A GAP, and why it is this and not the obvious thing.
//
// The crawler samples SPARSELY: one ask per combo per run, a four-day window rolling forward over a
// sixty-day horizon (`crawl-window.mjs`). Most journey dates are therefore unobserved on most days
// BY DESIGN. So "every journey date should have a row" would be an alarm that is always on, and an
// alarm that is always on is worse than none.
//
// The property the sampler actually promises, per run, is exactly one thing: **each combo is asked
// once, every run.** So that is what is measured here:
//
//   a combo is COVERED on an IST day when at least one row landed for it that day;
//   a GAP is a (combo, IST day) with nothing — a run that did not happen, or a combo it never
//   reached. Coverage is covered days over days elapsed since that combo's first observation.
//
// Three things follow, and each has a test below that pins it:
//
//   * a journey date missing from INSIDE an answered window is not a gap — the provider returns the
//     next four days the train RUNS (12301 asked 2026-10-15 answered 15, 16, 17 and 19);
//   * a short window — two rows at Tatkal — is a covered day, not a fractional one;
//   * today is never counted missing: the day is still open, and the run may not have happened yet.
//
// No key, no network and no database is touched by anything below.
// ---------------------------------------------------------------------------

const TODAY = "2026-09-23";

const COMBO = { train_no: "12051", from_code: "DR", to_code: "MAO", travel_class: "2S", quota: "GN" };
const KEY = "12051 DR-MAO 2S/GN";
const OTHER = { train_no: "12137", from_code: "CSMT", to_code: "NDLS", travel_class: "3A", quota: "GN" };
const KEY_OTHER = "12137 CSMT-NDLS 3A/GN";

/** One run's rows: the journey dates one window answered, all written on the same IST day. */
function run(combo: Record<string, string>, observedOn: string, dates?: readonly string[]) {
  const answered = dates ?? [0, 1, 2, 3].map((i) => addDays(observedOn, 30 + i));
  return answered.map((journey_date) => ({ ...combo, journey_date, observed_on: observedOn }));
}

/** `count` consecutive IST days of runs, minus the days named — which is how a hole is made. */
function runs(combo: Record<string, string>, firstDay: string, count: number, skip: readonly string[] = []) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const day = addDays(firstDay, i);
    if (!skip.includes(day)) rows.push(...run(combo, day));
  }
  return rows;
}

function coverage(rows: unknown, over: { today?: string; listed?: readonly string[] | null; minCoveragePct?: number } = {}) {
  const parsed = parseObservationRows(rows);
  if (!parsed.ok) throw new Error(`the rows do not parse: ${parsed.issues.join("; ")}`);
  return coverageReport({
    rows: parsed.rows,
    today: over.today ?? TODAY,
    listed: over.listed ?? null,
    minCoveragePct: over.minCoveragePct ?? DEFAULT_MIN_COVERAGE_PCT,
  });
}

function only(report: ReturnType<typeof coverage>) {
  const first = report.combos[0];
  if (!first) throw new Error("no combo was measured");
  return first;
}

// ---------------------------------------------------------------------------
// Parsing: what the store hands back is checked, never coerced
// ---------------------------------------------------------------------------

describe("parseObservationRows", () => {
  it("reads a row as the store returns it, and names its combo the way the crawler does", () => {
    const parsed = parseObservationRows([{ ...COMBO, journey_date: "2026-10-23", observed_on: "2026-09-23" }]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.rows).toEqual([{ trainNo: "12051", from: "DR", to: "MAO", travelClass: "2S", quota: "GN", journeyDate: "2026-10-23", observedOn: "2026-09-23" }]);
    }
  });

  it.each([
    ["a missing column", { ...COMBO, journey_date: "2026-10-23" }],
    ["a column that is not a string", { ...COMBO, train_no: 12051, journey_date: "2026-10-23", observed_on: "2026-09-23" }],
    ["a journey date that is not ISO", { ...COMBO, journey_date: "23-10-2026", observed_on: "2026-09-23" }],
    ["an observation day that is not a date at all", { ...COMBO, journey_date: "2026-10-23", observed_on: "2026-02-30" }],
  ])("refuses %s rather than coercing it — a coerced row would become a day that was never observed", (_label, row) => {
    const parsed = parseObservationRows([row]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it("refuses anything that is not an array of rows", () => {
    expect(parseObservationRows(null).ok).toBe(false);
    expect(parseObservationRows([null]).ok).toBe(false);
  });

  it("accepts an empty store: nothing observed is not a parse failure", () => {
    expect(parseObservationRows([])).toEqual({ ok: true, rows: [] });
  });
});

// ---------------------------------------------------------------------------
// The gap rule
// ---------------------------------------------------------------------------

describe("coverageReport", () => {
  it("names the IST day a run did not happen, which is the thing that cannot be backfilled", () => {
    const report = coverage(runs(COMBO, "2026-09-13", 10, ["2026-09-17"]));
    expect(only(report).missing).toEqual(["2026-09-17"]);
    expect(only(report).observedDays).toBe(9);
    expect(only(report).expectedDays).toBe(10);
  });

  it("names nothing when every day since the first observation landed a row", () => {
    const report = coverage(runs(COMBO, "2026-09-13", 10));
    expect(only(report).missing).toEqual([]);
    expect(report.coveragePct).toBe(100);
    expect(report.enough).toBe(true);
  });

  it("measures from the combo's own first observation, never from the start of the horizon", () => {
    const report = coverage(runs(COMBO, "2026-09-20", 3));
    expect(only(report).firstDay).toBe("2026-09-20");
    expect(only(report).expectedDays).toBe(3);
    expect(only(report).missing).toEqual([]);
  });

  it("never counts today as missing: the day is still open and the run may not have happened yet", () => {
    const report = coverage(runs(COMBO, "2026-09-13", 10));
    expect(only(report).missing).not.toContain(TODAY);
    expect(only(report).expectedDays).toBe(10);
    expect(only(report).sawToday).toBe(false);
  });

  it("counts the days a stopped crawler has missed, right up to yesterday", () => {
    const report = coverage(runs(COMBO, "2026-09-13", 5));
    expect(only(report).missing).toEqual(["2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"]);
    expect(report.coveragePct).toBe(50);
    expect(report.enough).toBe(false);
  });

  // The trap, three ways. Each of these is the provider behaving exactly as measured.
  it("is not a gap when a journey date is missing from inside an answered window", () => {
    const rows = runs(COMBO, "2026-09-13", 10).concat(run(COMBO, "2026-09-22", ["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-19"]));
    expect(only(coverage(rows)).missing).toEqual([]);
  });

  it("is not a gap when a window comes back short — a Tatkal window answers fewer days, and that is the truth about the berths", () => {
    const rows = [...Array(10).keys()].flatMap((i) => run(COMBO, addDays("2026-09-13", i), [addDays("2026-10-13", i)]));
    const report = coverage(rows);
    expect(only(report).missing).toEqual([]);
    expect(report.coveragePct).toBe(100);
  });

  it("counts a day once however many rows landed on it — the pre-sparse runs wrote a whole horizon in a day", () => {
    const dense = [...Array(60).keys()].map((i) => addDays("2026-09-23", i));
    const rows = runs(COMBO, "2026-09-13", 10).concat(run(COMBO, "2026-09-21", dense));
    expect(only(coverage(rows)).observedDays).toBe(10);
  });

  it("measures each combo from its own first day, so a combo added later is not born holed", () => {
    const report = coverage([...runs(COMBO, "2026-09-13", 10), ...runs(OTHER, "2026-09-20", 3)]);
    expect(report.combos.map((one) => one.combo)).toEqual([KEY, KEY_OTHER]);
    expect(report.combos.map((one) => one.expectedDays)).toEqual([10, 3]);
    expect(report.coveragePct).toBe(100);
  });

  it("says a combo first seen today is too new to measure, rather than failing the check on it", () => {
    const report = coverage(run(COMBO, TODAY));
    expect(report.expectedDays).toBe(0);
    expect(report.coveragePct).toBeNull();
    expect(report.enough).toBe(true);
    expect(only(report).sawToday).toBe(true);
  });

  it("is content with an empty store: there is nothing to be missing yet", () => {
    const report = coverage([]);
    expect(report.combos).toEqual([]);
    expect(report.coveragePct).toBeNull();
    expect(report.enough).toBe(true);
  });

  it("names a listed combo that has never landed a row, and leaves it out of the fraction — it has no denominator", () => {
    const report = coverage(runs(COMBO, "2026-09-13", 10), { listed: [KEY, KEY_OTHER] });
    expect(report.neverObserved).toEqual([KEY_OTHER]);
    expect(report.expectedDays).toBe(10);
    expect(report.coveragePct).toBe(100);
  });

  it("names a combo the list no longer asks for, and stops expecting it — nothing is owed by a combo nobody crawls", () => {
    const report = coverage([...runs(COMBO, "2026-09-13", 10), ...runs(OTHER, "2026-09-13", 2)], { listed: [KEY] });
    expect(report.unlisted).toEqual([KEY_OTHER]);
    expect(report.combos.map((one) => one.combo)).toEqual([KEY]);
    expect(report.expectedDays).toBe(10);
  });
});

describe("missingRanges", () => {
  it("groups consecutive days into one range, so a week off reads as a week and not as seven lines", () => {
    expect(missingRanges(["2026-09-14", "2026-09-15", "2026-09-16"])).toEqual([{ from: "2026-09-14", to: "2026-09-16", days: 3 }]);
  });

  it("keeps separate holes separate", () => {
    expect(missingRanges(["2026-09-14", "2026-09-16"])).toEqual([
      { from: "2026-09-14", to: "2026-09-14", days: 1 },
      { from: "2026-09-16", to: "2026-09-16", days: 1 },
    ]);
  });

  it("has nothing to say about a whole store", () => {
    expect(missingRanges([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The threshold, and the exit code a check will be wired to
// ---------------------------------------------------------------------------

describe("the threshold", () => {
  it("is 95% by default: one missed run in a twenty-run sweep", () => {
    expect(DEFAULT_MIN_COVERAGE_PCT).toBe(95);
  });

  it("passes a healthy store at the default", () => {
    const report = coverage(runs(COMBO, "2026-08-24", 30));
    expect(report.coveragePct).toBe(100);
    expect(exitCodeFor(report)).toBe(0);
  });

  it("fails a holed store at the default: two runs missed in twenty is 90%", () => {
    const report = coverage(runs(COMBO, "2026-09-03", 20, ["2026-09-08", "2026-09-15"]));
    expect(report.coveragePct).toBe(90);
    expect(report.enough).toBe(false);
    expect(exitCodeFor(report)).toBe(1);
  });

  it("passes at exactly the threshold — one missed run in twenty is the loss the number is chosen to tolerate", () => {
    const report = coverage(runs(COMBO, "2026-09-03", 20, ["2026-09-08"]));
    expect(report.coveragePct).toBe(95);
    expect(exitCodeFor(report)).toBe(0);
  });

  it("is a whole-store fraction, so one dead combo of six fails the check", () => {
    const rows = [...Array(5).keys()].flatMap((i) => runs({ ...COMBO, train_no: `1200${i}` }, "2026-09-03", 20));
    const dead = runs({ ...COMBO, train_no: "12009" }, "2026-09-03", 1);
    const report = coverage([...rows, ...dead]);
    expect(report.enough).toBe(false);
    expect(exitCodeFor(report)).toBe(1);
  });

  it("can be raised or lowered for a run, and the report carries the number it judged by", () => {
    const rows = runs(COMBO, "2026-09-03", 20, ["2026-09-08", "2026-09-15"]);
    expect(coverage(rows, { minCoveragePct: 90 }).enough).toBe(true);
    expect(coverage(rows, { minCoveragePct: 100 }).enough).toBe(false);
    expect(coverage(rows, { minCoveragePct: 90 }).minCoveragePct).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// What an operator reads
// ---------------------------------------------------------------------------

describe("summariseCoverage", () => {
  it("names what the number is a fraction OF, in the line itself", () => {
    const text = summariseCoverage(coverage(runs(COMBO, "2026-09-13", 10))).join("\n");
    expect(text).toMatch(/10 of 10/);
    expect(text).toMatch(/days .*since .*first observation/i);
  });

  it("names every hole, and the combo it is in", () => {
    const text = summariseCoverage(coverage(runs(COMBO, "2026-09-13", 10, ["2026-09-16", "2026-09-17"]))).join("\n");
    expect(text).toContain(KEY);
    expect(text).toContain("2026-09-16");
    expect(text).toContain("2026-09-17");
  });

  it("says plainly that a hole cannot be filled in later", () => {
    const text = summariseCoverage(coverage(runs(COMBO, "2026-09-13", 10, ["2026-09-16"]))).join("\n");
    expect(text).toMatch(/cannot be (back)?filled|never gets|lost for good/i);
  });

  it("says the store is whole when it is, without pretending a sparse sample is a dense one", () => {
    const text = summariseCoverage(coverage(runs(COMBO, "2026-09-13", 10))).join("\n");
    expect(text).toMatch(/no gap|whole/i);
  });

  it("says there is nothing to measure yet rather than printing a coverage of zero", () => {
    expect(summariseCoverage(coverage([])).join("\n")).toMatch(/nothing to measure/i);
  });

  it("says once that today has not landed yet, rather than marking every combo with it", () => {
    const lines = summariseCoverage(coverage(runs(COMBO, "2026-09-13", 10)));
    expect(lines.join("\n")).toMatch(/no combo has landed a row today/i);
    expect(lines.find((line) => line.includes(KEY))).not.toMatch(/today/i);
  });

  it("marks the combo a run reached past — the run happened, and this one got nothing", () => {
    const rows = [...runs(COMBO, "2026-09-13", 10), ...runs(OTHER, "2026-09-13", 11)];
    const lines = summariseCoverage(coverage(rows));
    expect(lines.find((line) => line.includes(KEY))).toMatch(/nothing today/i);
    expect(lines.find((line) => line.includes(KEY_OTHER))).not.toMatch(/nothing today/i);
  });

  it("names a listed combo that has never been observed", () => {
    const text = summariseCoverage(coverage(runs(COMBO, "2026-09-13", 10), { listed: [KEY, KEY_OTHER] })).join("\n");
    expect(text).toContain(KEY_OTHER);
    expect(text).toMatch(/never/i);
  });
});

// ---------------------------------------------------------------------------
// The one impure edge, driven by a stand-in: a half-read store must never be
// reported as a holed one
// ---------------------------------------------------------------------------

type Page = { data: unknown[] | null; error: { message: string } | null };
type Chain = { select: () => Chain; order: () => Chain; range: (from: number, to: number) => Promise<Page> };

function fakeStore(rows: readonly unknown[], failure?: { message: string }) {
  const asked: Array<[number, number]> = [];
  const chain: Chain = {
    select: () => chain,
    order: () => chain,
    range: async (from, to) => {
      asked.push([from, to]);
      return failure ? { data: null, error: failure } : { data: rows.slice(from, to + 1), error: null };
    },
  };
  return { db: { from: () => chain }, asked };
}

describe("readObservations", () => {
  const rows = [...Array(5).keys()].map((i) => ({ ...COMBO, journey_date: "2026-10-23", observed_on: addDays("2026-09-13", i) }));

  it("pages until the store is exhausted, because a truncated read invents holes that are not there", async () => {
    const { db, asked } = fakeStore(rows);
    const read = await readObservations(db, { table: "availability_observations", pageSize: 2 });
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.rows).toHaveLength(5);
    expect(asked).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it("refuses rather than reporting a store it could only half read", async () => {
    const { db } = fakeStore(rows);
    const read = await readObservations(db, { table: "availability_observations", pageSize: 2, maxRows: 4 });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toMatch(/more rows|too many|truncat/i);
  });

  it("refuses rather than reading a refusal as an empty store", async () => {
    const { db } = fakeStore(rows, { message: "permission denied for table availability_observations" });
    const read = await readObservations(db, { table: "availability_observations" });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("permission denied");
  });
});
