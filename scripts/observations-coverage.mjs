// Where the observation store is holed: the rule for what a gap is, the coverage it computes, and
// what it prints. Pure — rows in, verdict out, no clock and no database; the caller says what today
// is and hands over the rows, and even the store read takes its client as an argument.
//
// `observations-report.mjs` is the runner that wires this to the real store and is the only file
// that touches the world, exactly as `crawl-availability.mjs` stands to `crawl-plan.mjs`. A
// coverage rule that can only be tested against a live store is a coverage rule nobody will ever
// change safely.
//
// ---------------------------------------------------------------------------
// WHAT COUNTS AS A GAP. Read this before changing any rule below.
// ---------------------------------------------------------------------------
// The crawler samples SPARSELY (`crawl-window.mjs`): one ask per combo per run, a four-day window
// rolling forward over a sixty-day horizon. Most journey dates are therefore unobserved on most
// days BY DESIGN. "Every journey date should have a row" would be an alarm that is always on — and
// an alarm that is always on trains its reader to ignore it, so the one real hole arrives inside
// the noise. That is the failure this file is written to avoid.
//
// What the sampler actually promises per run is one thing, and it is the thing measured here:
// **each combo is asked once, every run.** So:
//
//     a combo is COVERED on an IST day when at least one row landed for it that day;
//     a GAP is a (combo, IST day) with nothing — a run that did not happen, or a combo the run
//     never reached;
//     COVERAGE is covered days over days elapsed since that combo's FIRST observation, up to and
//     including yesterday.
//
// Three consequences, each deliberate:
//
//   * A journey date missing from inside an answered window is NOT a gap. The provider returns the
//     next days the train RUNS: 12301 asked for 2026-10-15 answered 15, 16, 17 and 19 (measured).
//     The 18th is not a hole, and a Tuesday-only train legitimately answers one date in four.
//   * Today is never counted missing. The day is still open; the run may not have happened yet.
//     The cost is a day's lag before a stopped crawler shows up here, which is the honest trade.
//   * A combo first seen today has nothing closed to measure, and cannot fail the check.
//
// What this reading CANNOT see, said plainly because a coverage number that hides its blind spots
// is worse than none:
//
//   * a skipped BAND of journey dates. If a cursor is reset, or `--start` is used, or an ask is
//     refused (the cursor advances anyway, by design), the run still writes rows that day — so the
//     day is covered while a band of journey dates was never asked and never will be. The run's own
//     report names the refusal; this one cannot.
//   * whether a journey date got its four looks before departure. That is knowable only in
//     hindsight, and it cannot be told apart from a train that does not run that day.
//   * a combo listed but never once observed: it is NAMED below, but it has no first observation,
//     so it has no denominator and cannot enter the fraction.
//   * dilution. The fraction is over the whole store, so one dead combo of sixteen is 6.25% and
//     fails a 95% threshold — but one of forty would not. Read the per-combo lines too.
//
// No personal data: this reads seven columns about berths. There is no PNR here, no user, no
// passenger, and nothing printed below can be one.

import { comboKey } from "./crawl-plan.mjs";
import { DEFAULT_HORIZON_DAYS, DEFAULT_WINDOW_DAYS, addDays, cycleRuns, daysBetween } from "./crawl-window.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * How much of the expected sample may be missing before the check fails.
 *
 * **95% is one missed run in twenty**, and twenty is not a round number picked for comfort: a sweep
 * of the whole horizon takes `cycleRuns(60, 4)` = 20 runs, so the default tolerates losing one run
 * per sweep and fails on two. That is the right place for the line because a journey date is asked
 * once per sweep and gets about four looks in its life: lose one run in a sweep and one band loses
 * one of its four; lose two and the sample starts to thin everywhere at once.
 *
 * It is deliberately not 100%. A threshold no healthy store can hold is the always-on alarm again,
 * and one missed day would then fail the check for as long as it took the denominator to grow.
 */
export const DEFAULT_MIN_COVERAGE_PCT = 95;

/** The columns coverage needs, and nothing else — not a privacy rule this table needs, but a habit worth keeping. */
export const OBSERVATION_COLUMNS = "train_no,from_code,to_code,travel_class,quota,journey_date,observed_on";

/** PostgREST answers a page at a time; this is how many rows may be read before the report refuses to guess. */
export const DEFAULT_PAGE_SIZE = 1000;
export const DEFAULT_MAX_ROWS = 200_000;

/** @typedef {{ trainNo: string, from: string, to: string, travelClass: string, quota: string, journeyDate: string, observedOn: string }} Observation */
/** @typedef {{ ok: true, rows: Observation[] } | { ok: false, issues: string[] }} ParsedObservations */
/** @typedef {{ from: string, to: string, days: number }} Range */
/** @typedef {{ combo: string, firstDay: string, lastDay: string, expectedDays: number, observedDays: number, missing: string[], sawToday: boolean }} ComboCoverage */
/**
 * @typedef {{
 *   today: string, minCoveragePct: number, rows: number,
 *   combos: ComboCoverage[], unlisted: string[], neverObserved: string[],
 *   expectedDays: number, observedDays: number, coveragePct: number | null, enough: boolean
 * }} Coverage
 */

// ---------------------------------------------------------------------------
// Parsing: what the store hands back is checked, never coerced
// ---------------------------------------------------------------------------

/** One date rule for the whole pair of scripts: `addDays` refuses anything that is not a real calendar day. */
export function isCalendarDate(value) {
  try {
    return addDays(value, 0) === value;
  } catch {
    return false;
  }
}

/** Store column → the name it carries here. The five that identify a combo are the five `comboKey` reads. */
const COLUMNS = /** @type {const} */ ({
  train_no: "trainNo",
  from_code: "from",
  to_code: "to",
  travel_class: "travelClass",
  quota: "quota",
  journey_date: "journeyDate",
  observed_on: "observedOn",
});

const CASED = new Set(["from_code", "to_code", "travel_class", "quota"]);

/**
 * Parsed, never cast: a row that is not what the store promises is an issue, not a `String(...)`
 * call. A coerced row would become an observation day that nobody ever observed, which is the one
 * mistake this whole script exists to catch.
 *
 * @param {unknown} rows
 * @returns {ParsedObservations}
 */
export function parseObservationRows(rows) {
  if (!Array.isArray(rows)) return { ok: false, issues: ["the store did not return an array of rows"] };

  /** @type {string[]} */
  const issues = [];
  /** @type {Observation[]} */
  const parsed = [];

  rows.forEach((row, i) => {
    const at = `row ${i + 1}`;
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      issues.push(`${at}: must be an object`);
      return;
    }
    const entry = /** @type {Record<string, unknown>} */ (row);
    const missing = Object.keys(COLUMNS).filter((column) => typeof entry[column] !== "string" || String(entry[column]).trim() === "");
    if (missing.length > 0) {
      issues.push(`${at}: ${missing.join(", ")} must each be a non-empty string`);
      return;
    }
    const bad = ["journey_date", "observed_on"].filter((column) => !isCalendarDate(String(entry[column]).trim()));
    if (bad.length > 0) {
      issues.push(`${at}: ${bad.map((column) => `${column} is not a calendar date (${String(entry[column]).trim().slice(0, 32)})`).join(", ")}`);
      return;
    }
    // Upper-cased exactly where the writer upper-cases (`observations.ts`), so `sl` and `SL` can
    // never become two combos with half the coverage each.
    const one = /** @type {Record<string, string>} */ ({});
    for (const [column, name] of Object.entries(COLUMNS)) {
      const value = String(entry[column]).trim();
      one[name] = CASED.has(column) ? value.toUpperCase() : value;
    }
    parsed.push(/** @type {Observation} */ (/** @type {unknown} */ (one)));
  });

  return issues.length > 0 ? { ok: false, issues } : { ok: true, rows: parsed };
}

// ---------------------------------------------------------------------------
// The gap rule
// ---------------------------------------------------------------------------

/**
 * Consecutive missing days as one range each, so a fortnight off reads as a fortnight rather than
 * as fourteen lines an operator scrolls past.
 *
 * @param {readonly string[]} dates
 * @returns {Range[]}
 */
export function missingRanges(dates) {
  /** @type {Range[]} */
  const ranges = [];
  for (const date of [...dates].sort()) {
    const last = ranges[ranges.length - 1];
    if (last && addDays(last.to, 1) === date) {
      last.to = date;
      last.days += 1;
    } else ranges.push({ from: date, to: date, days: 1 });
  }
  return ranges;
}

/**
 * Coverage of the store, per combo and in total. Pure: rows in, verdict out, no clock and no
 * database — the caller says what today is and hands over the rows, so every rule above is testable
 * without either.
 *
 * `listed` is the route list, and it decides what is EXPECTED rather than merely present: a combo
 * nobody crawls any more owes nothing, and a combo on the list that has never landed a row is named
 * rather than scored. Pass `null` to measure whatever the store happens to hold.
 *
 * @param {{ rows: readonly Observation[], today: string, listed?: readonly string[] | null, minCoveragePct?: number }} options
 * @returns {Coverage}
 */
export function coverageReport({ rows, today, listed = null, minCoveragePct = DEFAULT_MIN_COVERAGE_PCT }) {
  if (!isCalendarDate(today)) throw new RangeError(`not an ISO date: ${today}`);
  if (!Number.isInteger(minCoveragePct) || minCoveragePct < 0 || minCoveragePct > 100) throw new RangeError(`the threshold is a whole percentage, 0 to 100; got ${minCoveragePct}`);

  // Yesterday, not today: today's run may not have happened yet, and a check that fails every
  // morning until somebody runs the crawler is a check nobody keeps.
  const lastClosedDay = addDays(today, -1);
  const expected = listed === null ? null : new Set(listed);

  /** @type {Map<string, Set<string>>} */
  const seen = new Map();
  for (const row of rows) {
    const key = comboKey(row);
    const days = seen.get(key) ?? new Set();
    days.add(row.observedOn);
    seen.set(key, days);
  }

  /** @type {ComboCoverage[]} */
  const combos = [];
  /** @type {string[]} */
  const unlisted = [];
  let expectedDays = 0;
  let observedDays = 0;

  for (const [combo, days] of [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (expected !== null && !expected.has(combo)) {
      unlisted.push(combo);
      continue;
    }
    const observed = [...days].sort();
    const firstDay = observed[0] ?? today;
    const lastDay = observed[observed.length - 1] ?? today;
    const span = Math.max(0, daysBetween(firstDay, lastClosedDay) + 1);

    /** @type {string[]} */
    const missing = [];
    for (let i = 0; i < span; i += 1) {
      const day = addDays(firstDay, i);
      if (!days.has(day)) missing.push(day);
    }

    combos.push({ combo, firstDay, lastDay, expectedDays: span, observedDays: span - missing.length, missing, sawToday: days.has(today) });
    expectedDays += span;
    observedDays += span - missing.length;
  }

  return {
    today,
    minCoveragePct,
    rows: rows.length,
    combos,
    unlisted,
    neverObserved: expected === null ? [] : [...expected].filter((combo) => !seen.has(combo)).sort(),
    expectedDays,
    observedDays,
    coveragePct: expectedDays === 0 ? null : Math.floor((observedDays * 100) / expectedDays),
    // Compared as whole numbers so a store that is exactly at the threshold can never fail on a
    // rounding error, and so the printed percentage and the verdict can never disagree.
    enough: observedDays * 100 >= minCoveragePct * expectedDays,
  };
}

// ---------------------------------------------------------------------------
// What an operator reads
// ---------------------------------------------------------------------------

const pad = (label) => label.padEnd(16);

/**
 * @param {Coverage} report
 * @returns {string[]}
 */
export function summariseCoverage(report) {
  const lastClosedDay = addDays(report.today, -1);
  const lines = [
    "",
    "Observation coverage — the store, not this run.",
    "",
    "A combo is covered on an IST day when at least one row landed for it that day: the crawler asks",
    "each combo once a run, so a day with nothing is a run that did not happen. A journey date missing",
    "from inside an answered window is not a gap — the provider answers the next days the train runs.",
  ];

  if (report.combos.length > 0) {
    const width = Math.max(0, ...report.combos.map((one) => one.combo.length));
    // A day with no rows at all is a run that has not happened yet, said once at the end. A combo
    // with no rows on a day the run DID reach others is the interesting case, and is marked here.
    const ranToday = report.combos.some((one) => one.sawToday);
    lines.push("");
    for (const one of report.combos) {
      const share = one.expectedDays === 0 ? "first seen today — nothing closed to measure yet" : `${one.observedDays} of ${one.expectedDays} days · ${Math.floor((one.observedDays * 100) / one.expectedDays)}% · first seen ${one.firstDay}`;
      const thin = one.expectedDays > 0 && one.observedDays * 100 < report.minCoveragePct * one.expectedDays ? " · below the threshold" : "";
      const missed = ranToday && !one.sawToday ? " · nothing today, though the run reached others" : "";
      lines.push(`  ${one.combo.padEnd(width)}  ${share}${thin}${missed}`);
      for (const range of missingRanges(one.missing)) {
        lines.push(`      no run on ${range.from}${range.days === 1 ? "" : ` … ${range.to} (${range.days} days)`}`);
      }
    }
    if (!ranToday) lines.push("", `No combo has landed a row today (${report.today}) yet — today is still open, and is not counted either way.`);
  }

  if (report.neverObserved.length > 0) {
    lines.push("", "Listed in the route file and never once observed — no first observation, so no coverage to measure:");
    for (const combo of report.neverObserved) lines.push(`  ${combo}`);
  }

  if (report.unlisted.length > 0) {
    lines.push("", "In the store but no longer on the route list — nothing more is expected of them:");
    for (const combo of report.unlisted) lines.push(`  ${combo}`);
  }

  lines.push("");
  if (report.expectedDays === 0) {
    lines.push("Nothing to measure yet: no combo has a day behind it. Coverage begins the day after a combo's first observation.");
    return lines;
  }

  lines.push(
    `${pad("coverage")} ${report.observedDays} of ${report.expectedDays} combo-days since each combo's first observation, up to ${lastClosedDay} (${report.coveragePct}%)`,
    `${pad("threshold")} ${report.minCoveragePct}% — one missed run in a ${cycleRuns(DEFAULT_HORIZON_DAYS, DEFAULT_WINDOW_DAYS)}-run sweep of the horizon`,
    "",
  );

  const holes = report.combos.reduce((count, one) => count + one.missing.length, 0);
  if (holes === 0) lines.push("No gap: every combo has a row on every day since its first.");
  else {
    lines.push(
      `${holes} combo-day${holes === 1 ? "" : "s"} ${holes === 1 ? "is" : "are"} missing, and cannot be backfilled: a past journey date answers 400, so what those runs would have seen is gone.`,
      report.enough ? "Still at or above the threshold." : "Below the threshold.",
    );
  }
  return lines;
}

/**
 * Non-zero the moment coverage falls below the threshold, so a check wired to this fails on a store
 * that is quietly stopping rather than on nothing at all.
 *
 * @param {Coverage} report
 * @returns {number}
 */
export function exitCodeFor(report) {
  return report.enough ? 0 : 1;
}

// ---------------------------------------------------------------------------
// The one impure edge, with the store injected so it is still testable
// ---------------------------------------------------------------------------

/** @typedef {{ data: unknown[] | null, error: { message: string } | null }} Page */
/** @typedef {{ select: (columns: string) => Chain, order: (column: string, options?: { ascending?: boolean }) => Chain, range: (from: number, to: number) => Promise<Page> }} Chain */
/** @typedef {{ from: (table: string) => Chain }} ObservationDb */

/**
 * Every row, a page at a time.
 *
 * **A half-read store is the one failure that would make this report lie**: PostgREST caps a
 * response, and a capped read looks exactly like a store with a hole in it. So the pages are walked
 * to the end, ordered by a unique tiebreak so no row can be skipped or repeated across pages, and
 * anything that cannot be read whole is refused rather than scored.
 *
 * @param {ObservationDb} db
 * @param {{ table: string, pageSize?: number, maxRows?: number }} options
 * @returns {Promise<{ ok: true, rows: unknown[] } | { ok: false, reason: string }>}
 */
export async function readObservations(db, { table, pageSize = DEFAULT_PAGE_SIZE, maxRows = DEFAULT_MAX_ROWS }) {
  /** @type {unknown[]} */
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    if (from >= maxRows) return { ok: false, reason: `the store holds more rows than this report will read (${maxRows}); it was not read whole, and a truncated read invents holes. Raise --max-rows.` };
    const { data, error } = await db
      .from(table)
      .select(OBSERVATION_COLUMNS)
      .order("observed_on", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return { ok: false, reason: `the store could not be read: ${error.message}` };
    if (!Array.isArray(data)) return { ok: false, reason: "the store answered without rows, which is not an empty store but an unreadable one" };
    rows.push(...data);
    if (data.length < pageSize) return { ok: true, rows };
  }
}
