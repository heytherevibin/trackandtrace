import { describe, expect, it } from "vitest";
import { addDays } from "../../../scripts/crawl-window.mjs";
import { DEFAULT_MIN_COVERAGE_PCT, coverageReport, exitCodeFor, missingRanges, parseObservationRows, readObservations, summariseCoverage } from "../../../scripts/observations-coverage.mjs";

// ---------------------------------------------------------------------------
// The rule behind `npm run source:report`: where the observation store is holed. A hole here is
// permanent — a past journey date answers `400 Failed to fetch availability` — so a day nobody
// crawled is a day the dataset never gets.
//
// **The rule itself, and what it cannot see, is `observations-coverage.mjs`'s header. Read that
// before changing a test here.** In one line: the crawler samples SPARSELY, so most journey dates
// are unobserved on most days BY DESIGN and "every journey date should have a row" would be an
// alarm that is always on. What every run does promise is that each combo is ASKED, so a combo is
// covered on an IST day when at least one row landed for it that day, and a gap is a (combo, day)
// with nothing.
//
// The three consequences each have a test below that pins them: a journey date missing from inside
// an answered window is not a gap (12301 asked 2026-10-15 answered 15, 16, 17 and 19); a short
// Tatkal window is a covered day, not a fractional one; today is never counted missing. No key, no
// network and no database is touched by anything below.
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

function coverage(rows: unknown, over: { today?: string; listed?: readonly string[] | null; minCoveragePct?: number; since?: string | null } = {}) {
  const parsed = parseObservationRows(rows);
  if (!parsed.ok) throw new Error(`the rows do not parse: ${parsed.issues.join("; ")}`);
  return coverageReport({
    rows: parsed.rows,
    today: over.today ?? TODAY,
    listed: over.listed ?? null,
    minCoveragePct: over.minCoveragePct ?? DEFAULT_MIN_COVERAGE_PCT,
    since: over.since ?? null,
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

// ---------------------------------------------------------------------------
// The stretch nobody crawled on purpose, and the store nobody crawled at all
// ---------------------------------------------------------------------------

/** Off the route list on 09-11 because it was refusing — what the runbook says to do — and back on 09-20. */
const readded = [...runs(COMBO, "2026-09-01", 10), ...runs(COMBO, "2026-09-20", 3)];

describe("--since", () => {
  it("scores a re-added combo as holed for the whole removal when it is not told otherwise — the outage must not vanish on its own", () => {
    const report = coverage(readded);
    expect(only(report).missing).toEqual(["2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"]);
    expect(report.coveragePct).toBe(59);
    expect(exitCodeFor(report)).toBe(1);
  });

  it("measures from the day it is given, so a stretch the crawler was told not to fill is out of the denominator", () => {
    const report = coverage(readded, { since: "2026-09-20" });
    expect(only(report).measuredFrom).toBe("2026-09-20");
    expect(only(report).missing).toEqual([]);
    expect(report.expectedDays).toBe(3);
    expect(report.coveragePct).toBe(100);
    expect(exitCodeFor(report)).toBe(0);
  });

  it("still says when the combo was really first seen, so a narrowed window cannot be read as a short history", () => {
    expect(only(coverage(readded, { since: "2026-09-20" })).firstDay).toBe("2026-09-01");
  });

  it("only ever narrows: a combo first seen after the date given is still measured from its own first day", () => {
    const report = coverage(runs(COMBO, "2026-09-21", 2), { since: "2026-09-10" });
    expect(only(report).measuredFrom).toBe("2026-09-21");
    expect(only(report).expectedDays).toBe(2);
  });

  it("does not excuse a combo whose every row predates it — that is a dead combo, not a quiet one", () => {
    const report = coverage(runs(COMBO, "2026-09-01", 10), { since: "2026-09-20" });
    expect(only(report).observedDays).toBe(0);
    expect(only(report).expectedDays).toBe(3);
    expect(report.enough).toBe(false);
  });

  it("refuses a date after today rather than measuring an empty window into a green report", () => {
    expect(() => coverage(readded, { since: "2026-09-24" })).toThrow(/since/i);
  });

  it("says in the output that the window was narrowed, and by whose instruction", () => {
    const text = summariseCoverage(coverage(readded, { since: "2026-09-20" })).join("\n");
    expect(text).toContain("2026-09-20");
    expect(text).toMatch(/--since/);
  });
});

describe("a store nothing has ever been written to", () => {
  it("fails the check when every listed combo is unobserved: a gate that is green on an empty store is a gate that is failing", () => {
    const report = coverage([], { listed: [KEY, KEY_OTHER] });
    expect(report.nothingObserved).toBe(true);
    expect(report.enough).toBe(false);
    expect(exitCodeFor(report)).toBe(1);
  });

  it("names it as a crawler that has never written here, not as a coverage number", () => {
    const text = summariseCoverage(coverage([], { listed: [KEY, KEY_OTHER] })).join("\n");
    expect(text).toMatch(/never (once )?(been )?(observed|written)|has never written/i);
  });

  it("is still content with an empty store nobody has asked anything of — without a route list there is nothing that ought to be there", () => {
    const report = coverage([]);
    expect(report.nothingObserved).toBe(false);
    expect(report.enough).toBe(true);
    expect(exitCodeFor(report)).toBe(0);
  });

  it("does not fire merely because one listed combo of two has never been observed", () => {
    const report = coverage(runs(COMBO, "2026-09-13", 10), { listed: [KEY, KEY_OTHER] });
    expect(report.nothingObserved).toBe(false);
    expect(exitCodeFor(report)).toBe(0);
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

  it("prints the threshold it judged by, and a percentage that agrees with the verdict", () => {
    const report = coverage(runs(COMBO, "2026-09-03", 20, ["2026-09-08", "2026-09-15"]), { minCoveragePct: 90 });
    const text = summariseCoverage(report).join("\n");
    expect(text).toContain(`(${report.coveragePct}%)`);
    expect(text).toMatch(/threshold\s+90%/);
    expect(report.enough).toBe(true);
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
type Chain = { select: () => Chain; order: () => Chain; abortSignal: () => Chain; range: (from: number, to: number) => Promise<Page> };

/**
 * A stand-in PostgREST, and the point of it is `serverCap`: PostgREST applies its OWN row cap
 * (Supabase: Settings → API → *Max rows*) on top of what was asked for, so a page shorter than the
 * one requested is NOT proof that the store is exhausted — and a harness that can only return a
 * short page as its LAST page cannot express the failure this read exists to prevent. `failOnAsk`
 * and `nullDataOnAsk` break one numbered request, so a read that dies halfway is representable too.
 */
function fakeStore(rows: readonly unknown[], over: { serverCap?: number; failOnAsk?: number; message?: string; nullDataOnAsk?: number } = {}) {
  const asked: Array<[number, number]> = [];
  const chain: Chain = {
    select: () => chain,
    order: () => chain,
    abortSignal: () => chain,
    range: async (from, to) => {
      asked.push([from, to]);
      if (over.failOnAsk === asked.length) return { data: null, error: { message: over.message ?? "upstream reset" } };
      if (over.nullDataOnAsk === asked.length) return { data: null, error: null };
      return { data: rows.slice(from, from + Math.min(to - from + 1, over.serverCap ?? Number.MAX_SAFE_INTEGER)), error: null };
    },
  };
  return { db: { from: () => chain }, asked };
}

function store(count: number, from = "2026-09-13") {
  return [...Array(count).keys()].map((i) => ({ ...COMBO, journey_date: "2026-10-23", observed_on: addDays(from, i) }));
}

describe("readObservations", () => {
  const rows = store(5);

  // The property, not the stop condition: what comes back is every row the store holds, once each,
  // in the order it holds them. Any loop that satisfies this is a correct loop.
  it("hands back every row the store holds, exactly once and in order", async () => {
    const { db, asked } = fakeStore(rows);
    const read = await readObservations(db, { table: "availability_observations", pageSize: 2 });
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.rows).toEqual(rows);
    expect(new Set(asked.map(String)).size).toBe(asked.length);
  });

  it("reads the store whole when the SERVER caps a page below the page size — a short page is not proof of exhaustion", async () => {
    // 88 rows, a server capped at 40, and the default-sized page asked for. The rows are ordered by
    // `observed_on` ascending, so a read that stopped at the first short page would drop the most
    // recent days — and the report would then invent a `no run on …` for every one of them.
    const many = store(88, "2026-06-28");
    const { db } = fakeStore(many, { serverCap: 40 });
    const read = await readObservations(db, { table: "availability_observations", pageSize: 1000 });
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.rows).toEqual(many);
  });

  it("refuses rather than reporting a store it could only half read", async () => {
    const { db } = fakeStore(rows);
    const read = await readObservations(db, { table: "availability_observations", pageSize: 2, maxRows: 4 });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toMatch(/more rows|too many|truncat/i);
  });

  it("reads a store holding exactly the row limit, rather than refusing one it did read whole", async () => {
    const { db } = fakeStore(rows);
    const read = await readObservations(db, { table: "availability_observations", pageSize: 2, maxRows: 5 });
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.rows).toHaveLength(5);
  });

  it("refuses rather than reading a refusal as an empty store", async () => {
    const { db } = fakeStore(rows, { failOnAsk: 1, message: "permission denied for table availability_observations" });
    const read = await readObservations(db, { table: "availability_observations" });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("permission denied");
  });

  it("refuses when a page fails PARTWAY, and scores none of what it had already read", async () => {
    const { db } = fakeStore(store(6), { failOnAsk: 2 });
    const read = await readObservations(db, { table: "availability_observations", pageSize: 2 });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("upstream reset");
  });

  it("refuses a page that answers without rows at all: unreadable is not empty", async () => {
    const { db } = fakeStore(rows, { nullDataOnAsk: 1 });
    const read = await readObservations(db, { table: "availability_observations" });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toMatch(/without rows|unreadable/i);
  });

  it("refuses a page size of zero rather than asking for nothing and calling the store exhausted", async () => {
    const { db } = fakeStore(rows);
    await expect(readObservations(db, { table: "availability_observations", pageSize: 0 })).rejects.toThrow(/page size/i);
  });

  it("is content with a store that holds nothing", async () => {
    const { db } = fakeStore([]);
    const read = await readObservations(db, { table: "availability_observations" });
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.rows).toEqual([]);
  });
});
