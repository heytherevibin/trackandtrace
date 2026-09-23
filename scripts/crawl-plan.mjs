// The availability crawler's plan: the stride, the route list and its preflight, the two gates that
// keep the run off the provider's plan, the loop that walks the list, and what it reports.
//
// Everything here is pure — no network, no database, no clock beyond the date it is handed — so all
// of it is tested without either. `crawl-availability.mjs` is the runner that wires it to the real
// adapter and the real store, and is the only file that touches the world.
//
// ---------------------------------------------------------------------------
// THE GATE. Read this before changing anything below.
// ---------------------------------------------------------------------------
// The daily live budget (`live-budget.ts`) is consulted only on the PNR path, and the usage counter
// (`usage.ts`) counts without enforcing. So a crawler sits outside the only gate this product has
// and can spend the whole monthly plan. A spent plan answers 429; a 429 is a fact about the
// provider, so the shared fuse correctly rests BOTH callers — and with `PNR_FALLBACK=none` that rest
// is a traveller's final answer. Quota, not failure evidence, is the shortest path from this crawler
// to a traveller being told the service is down.
//
// So a run gates itself, twice, and both gates STOP it rather than slow it:
//
//   A. The month — `crawlCeiling`. A hard per-run call ceiling: the provider's daily plan less what
//      live PNR checks are allowed to spend, capped at ABSOLUTE_MAX_CALLS_PER_RUN. `--max-calls` can
//      only lower it. The runner refuses to start when the worst case exceeds it, and `runCrawl`
//      refuses to begin an ask that could carry it past it, so calls can never exceed it.
//   B. The burst — `remainingVerdict`. The provider's own `RateLimit-Remaining`, read from every
//      response. At or below the floor the run stops, so the token bucket is never emptied under a
//      live check.
//
// Nothing here ever calls `liveBudget.take()`: spending a traveller's allowance to fill a dataset is
// the exact failure this file exists to prevent.
//
// **What gate A does not do, stated plainly: it is per RUN, not per DAY.** Two runs in one day spend
// twice the ceiling, because nothing here remembers the first. A human runs this and reads it, so
// today that is a human's decision to make. It stops being one the moment anything schedules this:
// a scheduled crawler needs a shared daily counter of its own — its own key, since `usage.ts` counts
// both callers together and cannot say which spent what — and that counter must exist BEFORE the
// first unattended run, not after the first spent month.
//
// One more leak this is designed around: `guarded.ts` calls `countRequest()` BEFORE `source.check()`,
// and the adapter returns INVALID before any fetch. A malformed route therefore spends the
// provider's daily usage count on a call that never happens. That is why a bad entry fails the
// PREFLIGHT, before anything is spent, and why asks and calls are reported separately.
//
// No personal data: this is about berths. There is no PNR here, no user, no passenger.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = new URL("./", import.meta.url);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** `guarded.ts` retries a check at most once, so one ask costs at most two calls. */
export const CALLS_PER_ASK_MAX = 2;
/** Nothing a flag can say makes one run worth more than this. The last line of the gate. */
export const ABSOLUTE_MAX_CALLS_PER_RUN = 500;
/**
 * How far one call reaches. Measured 2026-09-23: `/seats` answers **four dated entries** running
 * forward from the date asked for — which is not the same as the asked date plus the next three.
 * 12301 HWH-NDLS 3A/GN asked for 2026-10-15 answered 15, 16, 17 and **19**: four entries spanning
 * five days, with the 18th simply absent. A quota can shorten it too — a TQ combo answered two.
 *
 * The stride is still 4, and still right, because every ask starts at its own date: asking D, D+4,
 * D+8 … leaves no calendar day unasked. What varies is what comes back, and a date the provider
 * omits is a day it has nothing to say about, not a hole the stride opened. Where a window runs past
 * D+3 the next ask re-reads that day; the store's upsert absorbs it, later read winning.
 */
export const DEFAULT_WINDOW_DAYS = 4;
export const DEFAULT_HORIZON_DAYS = 60;
/**
 * Advance is 10,000 a month ≈ 333 a day, shared with live traveller traffic. The reserve subtracted
 * from it is not a constant here: it is `LIVE_REQUESTS_PER_DAY` (300), read from the environment, so
 * the crawler's headroom moves whenever the live budget does.
 */
export const DEFAULT_DAILY_ALLOWANCE = 333;
/** RailKit's bucket is 600 per 10 minutes; this much of it is left standing for live checks. */
export const DEFAULT_REMAINING_FLOOR = 50;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TRAIN_NO = /^\d{5}$/;
const STATION = /^[A-Z]{2,5}$/;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// The shapes, written down so the tests that import this file are checked
// against them rather than against whatever TypeScript can infer from a literal.
// ---------------------------------------------------------------------------

/** @typedef {{ trainNo: string, from: string, to: string, travelClass: string, quota: string, note?: string }} Route */
/** @typedef {{ trainNo: string, from: string, to: string, journeyDate: string, travelClass: string, quota: string }} AskRequest */
/** @typedef {{ ok: true, answer: unknown }} Answered */
/** @typedef {{ ok: false, code: string, message: string, cause?: string, status?: number }} Refused */
/** @typedef {Answered | Refused} Outcome */
/** @typedef {{ outcome: Outcome, calls: number, remaining?: string | null }} AskResult */
/** @typedef {{ combo: string, date: string, code: string, why: string }} Failure */
/** @typedef {{ ok: true, routes: Route[], horizonDays?: number } | { ok: false, issues: string[] }} ParsedRoutes */
/**
 * @typedef {{
 *   start: string, horizonDays: number, windowDays: number, dates: string[],
 *   listed: number, planned: number, combos: number, asks: number, calls: number, rows: number,
 *   failures: Failure[], alwaysRefused: string[], stopped: string | null,
 *   remaining: number | null, whole: boolean
 * }} Summary
 */

// ---------------------------------------------------------------------------
// The stride — the one piece of arithmetic that must be right
// ---------------------------------------------------------------------------

function utcDay(iso) {
  const match = ISO_DATE.exec(String(iso).trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const at = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const probe = new Date(at);
  if (probe.getUTCFullYear() !== Number(y) || probe.getUTCMonth() !== Number(m) - 1 || probe.getUTCDate() !== Number(d)) return null;
  return at;
}

/** ISO in, ISO out, through UTC milliseconds — so a month end or a leap day cannot drift. */
export function addDays(iso, days) {
  const at = utcDay(iso);
  if (at === null) throw new RangeError(`not an ISO date: ${iso}`);
  return new Date(at + days * DAY_MS).toISOString().slice(0, 10);
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a whole number of days, at least 1; got ${value}`);
  return value;
}

/**
 * Which dates to ask for, to cover `horizonDays` from `start` exactly once.
 *
 * One call answers `windowDays` consecutive days, so the asks are `windowDays` apart and there are
 * `ceil(horizon / window)` of them: a sixty-day horizon is fifteen calls, not sixty. Off by one and
 * the run either pays 25% more quota forever or leaves a `windowDays`-long hole in every combo that
 * nothing can fill, because past dates answer `400 Failed to fetch availability`.
 *
 * The first ask is `start` and never a day before it, for the same reason.
 */
export function askDates(start, horizonDays, windowDays) {
  if (utcDay(start) === null) throw new RangeError(`not an ISO date: ${start}`);
  positiveInteger(horizonDays, "horizonDays");
  positiveInteger(windowDays, "windowDays");
  const asks = Math.ceil(horizonDays / windowDays);
  return Array.from({ length: asks }, (_, i) => addDays(start, i * windowDays));
}

/** Every day the given asks actually cover. The test for "no gap, no repeat" is written against this. */
export function coveredDates(asks, windowDays) {
  positiveInteger(windowDays, "windowDays");
  return asks.flatMap((date) => Array.from({ length: windowDays }, (_, i) => addDays(date, i)));
}

// ---------------------------------------------------------------------------
// The route list, and the preflight that runs before anything is spent
// ---------------------------------------------------------------------------

const FIELDS = ["trainNo", "from", "to", "travelClass", "quota"];

export function loadRouteFile(path = fileURLToPath(new URL("routes.json", HERE))) {
  return readFileSync(path, "utf8");
}

/**
 * Parsed, never coerced: a field that is not a string is an issue, not a `String(...)` call.
 *
 * @param {string} text
 * @returns {ParsedRoutes}
 */
export function parseRouteFile(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    return { ok: false, issues: [`the route file is not JSON: ${error.message}`] };
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false, issues: ["the route file must be a JSON object"] };
  if (!Array.isArray(body.routes) || body.routes.length === 0) return { ok: false, issues: ["the route file must carry a non-empty `routes` array"] };

  /** @type {string[]} */
  const issues = [];
  /** @type {Route[]} */
  const routes = [];
  body.routes.forEach((entry, i) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push(`route ${i + 1}: must be an object`);
      return;
    }
    const missing = FIELDS.filter((field) => typeof entry[field] !== "string" || entry[field].trim() === "");
    if (missing.length > 0) {
      issues.push(`route ${i + 1}: ${missing.join(", ")} must each be a non-empty string`);
      return;
    }
    routes.push({
      trainNo: entry.trainNo.trim(),
      from: entry.from.trim().toUpperCase(),
      to: entry.to.trim().toUpperCase(),
      travelClass: entry.travelClass.trim().toUpperCase(),
      quota: entry.quota.trim().toUpperCase(),
      ...(typeof entry.note === "string" ? { note: entry.note } : {}),
    });
  });

  if (issues.length > 0) return { ok: false, issues };
  const horizonDays = Number.isInteger(body.horizonDays) && body.horizonDays > 0 ? body.horizonDays : undefined;
  return { ok: true, routes, ...(horizonDays === undefined ? {} : { horizonDays }) };
}

/**
 * How a combo is named everywhere an operator reads about it.
 *
 * @param {Route} route
 * @returns {string}
 */
export function comboKey(route) {
  return `${route.trainNo} ${route.from}-${route.to} ${route.travelClass}/${route.quota}`;
}

/**
 * Every rule the adapter's own `normalise` applies, applied here first.
 *
 * This is the point of the whole function: the adapter refuses a malformed route locally and
 * returns INVALID, but `guarded.ts` has already called `countRequest()` by then — so a bad entry
 * spends the provider's daily usage on a call that never leaves the process. A bad entry fails the
 * run's preflight, not its budget.
 *
 * @param {readonly Route[]} routes
 * @param {{ classes: readonly string[], quotas: readonly string[] }} sets
 * @returns {string[]}
 */
export function preflight(routes, sets) {
  const classes = new Set(sets.classes);
  const quotas = new Set(sets.quotas);
  /** @type {string[]} */
  const issues = [];
  /** @type {Map<string, number>} */
  const seen = new Map();

  routes.forEach((route, i) => {
    const at = `route ${i + 1} (${comboKey(route)})`;
    if (!TRAIN_NO.test(route.trainNo)) issues.push(`${at}: the train number must be exactly five digits`);
    else if (!STATION.test(route.from)) issues.push(`${at}: ${route.from} is not a station code (two to five capital letters)`);
    else if (!STATION.test(route.to)) issues.push(`${at}: ${route.to} is not a station code (two to five capital letters)`);
    else if (route.from === route.to) issues.push(`${at}: the leg starts and ends at the same station`);
    else if (!classes.has(route.travelClass)) issues.push(`${at}: ${route.travelClass} is not a class the schema knows`);
    else if (!quotas.has(route.quota)) issues.push(`${at}: ${route.quota} is not a quota the schema knows`);
    else {
      const key = comboKey(route);
      const first = seen.get(key);
      if (first !== undefined) issues.push(`${at}: the same combo is already route ${first}; it would spend the whole horizon twice`);
      else seen.set(key, i + 1);
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Gate A: the month
// ---------------------------------------------------------------------------

/**
 * How many provider calls this run may make.
 *
 * The plan's day, less what live PNR checks are allowed to spend, capped absolutely. `requested`
 * (`--max-calls`) may only lower it: a ceiling a flag can raise is not a ceiling, and widening it
 * means saying out loud, through `--reserve`, how many live checks are being left unprotected.
 *
 * @param {{ dailyAllowance: number, liveReserve: number, requested?: number }} plan
 * @returns {{ ceiling: number, headroom: number, reason: string }}
 */
export function crawlCeiling({ dailyAllowance, liveReserve, requested }) {
  const headroom = Math.max(0, Math.trunc(dailyAllowance) - Math.trunc(liveReserve));
  const capped = Math.min(headroom, ABSOLUTE_MAX_CALLS_PER_RUN);
  const ceiling = requested === undefined ? capped : Math.max(0, Math.min(Math.trunc(requested), capped));
  const reason =
    capped === 0
      ? `0 calls: the whole plan (${dailyAllowance} a day) is reserved for live PNR checks, so there is nothing to crawl with`
      : `${ceiling} calls: ${dailyAllowance} a day on the plan, less ${liveReserve} reserved for live PNR checks` +
        (capped === ABSOLUTE_MAX_CALLS_PER_RUN && headroom > ABSOLUTE_MAX_CALLS_PER_RUN ? `, capped at the per-run maximum of ${ABSOLUTE_MAX_CALLS_PER_RUN}` : "") +
        (requested !== undefined && requested < capped ? `, lowered to ${ceiling} by --max-calls` : "");
  return { ceiling, headroom, reason };
}

/**
 * The worst case: every combo, every stride, and the one retry `guarded.ts` allows each.
 *
 * @param {{ combos: number, asksPerCombo: number, callsPerAsk?: number }} plan
 * @returns {number}
 */
export function plannedCalls({ combos, asksPerCombo, callsPerAsk = CALLS_PER_ASK_MAX }) {
  return combos * asksPerCombo * callsPerAsk;
}

// ---------------------------------------------------------------------------
// Gate B: the burst, as the provider itself counts it
// ---------------------------------------------------------------------------

/**
 * What `RateLimit-Remaining` says. A header the provider did not send gates nothing: we cannot act
 * on what we do not know.
 *
 * @param {string | null | undefined} header
 * @param {number} floor
 * @returns {{ known: boolean, remaining: number | null, stop: boolean }}
 */
export function remainingVerdict(header, floor) {
  if (header === null || header === undefined) return { known: false, remaining: null, stop: false };
  const value = Number(String(header).trim());
  if (!Number.isInteger(value) || value < 0) return { known: false, remaining: null, stop: false };
  return { known: true, remaining: value, stop: value <= floor };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** @param {Refused} outcome */
function why(outcome) {
  const cause = outcome.cause ? ` (${outcome.cause}${outcome.status === undefined ? "" : ` ${outcome.status}`})` : "";
  return `${outcome.code}${cause}: ${outcome.message}`;
}

/**
 * Walks the list, one ask per combo per stride, and counts what actually happened.
 *
 * `ask` and `record` are injected so the loop, the gates and the report are testable without a
 * network or a database. `ask` returns `{ outcome, calls, remaining }`: `calls` is how many requests
 * actually left the process for that ask (0 when the breaker was resting, 2 when the guard retried),
 * which is why asks and calls are reported separately.
 *
 * A refused combo is reported and the run continues — one bad entry must not cost the rest of the
 * list. A gate, by contrast, stops the run: slowing down would still spend the plan.
 *
 * @param {{
 *   routes: readonly Route[], start: string, horizonDays: number, windowDays: number,
 *   ask: (request: AskRequest) => Promise<AskResult>,
 *   record: (request: AskRequest, outcome: Answered) => Promise<number>,
 *   ceiling: number, remainingFloor?: number, callsPerAsk?: number
 * }} options
 * @returns {Promise<Summary>}
 */
export async function runCrawl({ routes, start, horizonDays, windowDays, ask, record, ceiling, remainingFloor = 0, callsPerAsk = CALLS_PER_ASK_MAX }) {
  const dates = askDates(start, horizonDays, windowDays);
  const planned = routes.length * dates.length;
  /** @type {Summary} */
  const summary = {
    start,
    horizonDays,
    windowDays,
    dates,
    listed: routes.length,
    planned,
    combos: 0,
    asks: 0,
    calls: 0,
    rows: 0,
    failures: [],
    alwaysRefused: [],
    stopped: null,
    remaining: null,
    whole: false,
  };

  for (const route of routes) {
    if (summary.stopped !== null) break;
    const key = comboKey(route);
    let asked = 0;
    // Whether the PROVIDER answered, which is not the same as whether a row was written. A store
    // that refuses every write would otherwise make every combo look like a bad list entry, and
    // send an operator deleting good routes over a fault that is ours.
    let provided = 0;

    for (const journeyDate of dates) {
      if (summary.calls + callsPerAsk > ceiling) {
        summary.stopped = `the run's own ceiling of ${ceiling} calls — stopping rather than slowing, so the plan live checks depend on stays whole`;
        break;
      }

      const request = { trainNo: route.trainNo, from: route.from, to: route.to, journeyDate, travelClass: route.travelClass, quota: route.quota };
      const { outcome, calls, remaining } = await ask(request);
      asked += 1;
      summary.asks += 1;
      summary.calls += calls;

      const seen = remainingVerdict(remaining, remainingFloor);
      if (seen.known) summary.remaining = seen.remaining;

      if (outcome.ok) {
        provided += 1;
        const written = await record(request, outcome);
        summary.rows += written;
        if (written === 0) summary.failures.push({ combo: key, date: journeyDate, code: "NOT_RECORDED", why: "the provider answered but the store wrote no rows" });
      } else {
        summary.failures.push({ combo: key, date: journeyDate, code: outcome.code, why: why(outcome) });
      }

      if (seen.stop) {
        summary.stopped = `the provider's own RateLimit-Remaining fell to ${seen.remaining}, at or below the floor of ${remainingFloor}`;
        break;
      }
    }

    if (asked > 0) summary.combos += 1;
    // Measured: 12951 answers `Unable to process your request` for every class and date tried. A
    // combo that refuses on every stride is a bad list entry wearing a failure's clothes, and saying
    // so is what stops it being retried daily forever.
    if (asked > 0 && provided === 0 && summary.stopped === null) summary.alwaysRefused.push(key);
  }

  summary.whole = summary.stopped === null && summary.failures.length === 0 && summary.asks === planned;
  return summary;
}

// ---------------------------------------------------------------------------
// What it reports. A silent partial run is what quietly ruins the dataset.
// ---------------------------------------------------------------------------

const pad = (label) => label.padEnd(18);

/**
 * @param {Summary} summary
 * @returns {string[]}
 */
export function summarise(summary) {
  const lines = [
    "",
    `${pad("combos attempted")} ${summary.combos} of ${summary.listed}`,
    `${pad("asks")} ${summary.asks} of ${summary.planned} planned (${summary.dates.length} strides × ${summary.windowDays} days, ${summary.horizonDays}-day horizon from ${summary.start})`,
    `${pad("calls made")} ${summary.calls}`,
    `${pad("rows written")} ${summary.rows}`,
    `${pad("RateLimit-Remaining")} ${summary.remaining === null ? "not sent by the provider" : summary.remaining}`,
  ];

  if (summary.stopped !== null) lines.push("", `STOPPED: ${summary.stopped}`);

  if (summary.failures.length > 0) {
    lines.push("", `${summary.failures.length} ask${summary.failures.length === 1 ? "" : "s"} did not become rows. Each is a permanent hole: past dates answer 400 and cannot be re-read.`);
    for (const failure of summary.failures) lines.push(`  ${failure.combo}  ${failure.date}  ${failure.why}`);
  }

  if (summary.alwaysRefused.length > 0) {
    lines.push("", "Refused on every stride — a bad list entry, not a transient failure. Delete it from routes.json rather than retrying it daily:");
    for (const combo of summary.alwaysRefused) lines.push(`  ${combo}`);
  }

  lines.push("", summary.whole ? "The run was whole: every combo, every stride." : "The run was NOT whole. The dataset has holes where the lines above say it does.");
  return lines;
}

/**
 * Non-zero the moment the run was not whole, so an operator reading only the exit code still learns
 * of the hole.
 *
 * @param {Summary} summary
 * @returns {number}
 */
export function exitCodeFor(summary) {
  return summary.whole ? 0 : 1;
}
