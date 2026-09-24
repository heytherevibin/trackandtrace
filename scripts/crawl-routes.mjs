// The route list: how `scripts/routes.json` is read, how a combo is named, and the preflight that
// must reject a bad entry BEFORE a single provider call is spent.
//
// Split out of `crawl-plan.mjs` when that file crossed 500 lines. Pure: text in, routes or issues
// out. `crawl-plan.mjs` re-exports everything here, so the other scripts import it from there.
//
// Why the preflight is not a nicety: `guarded.ts` calls `countRequest()` BEFORE `source.check()`,
// and the adapter returns INVALID before any fetch. A malformed route therefore spends the
// provider's daily usage count on a call that never leaves the process. A bad entry must cost the
// run's preflight, not its budget.
//
// No personal data: a route is a train, two stations, a class and a quota.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = new URL("./", import.meta.url);

const TRAIN_NO = /^\d{5}$/;
const STATION = /^[A-Z]{2,5}$/;

/** @typedef {{ trainNo: string, from: string, to: string, travelClass: string, quota: string, note?: string }} Route */
/** @typedef {{ ok: true, routes: Route[], horizonDays?: number } | { ok: false, issues: string[] }} ParsedRoutes */


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

// ---------------------------------------------------------------------------
// The one piece of DOMAIN knowledge in the crawler, kept together and labelled
// ---------------------------------------------------------------------------

/**
 * @typedef {{ basis: "measured" | "inferred", why: string, evidence: string, settledBy: string }} QuotaWindow
 */

/**
 * Quotas that only go on sale close to departure, so the ROLLING window can never answer for them.
 *
 * Read `basis` before you trust an entry. **`measured` means this project asked the provider and
 * wrote down what came back; `inferred` means nobody here has.** The distinction is the whole point
 * of this table: skipping a combo's rolling ask is a decision about what the dataset will contain
 * for the next sixty days, and a reader has to be able to tell which entries rest on evidence. Do
 * not add a quota because it sounds like Tatkal — add it with a `basis`, and if that basis is
 * `inferred`, say in `settledBy` what would turn it into a measurement.
 *
 * This is deliberately NOT every quota with unusual timing. `quotaSchema` has 21 members; two are
 * here. The rest keep their rolling ask, which costs one call a run and is the safe direction to
 * be wrong in — a wasted call, rather than a quota silently losing its long-range sample.
 *
 * @type {ReadonlyMap<string, QuotaWindow>}
 */
export const QUOTAS_OPENING_NEAR_DEPARTURE = new Map([
  [
    "TQ",
    {
      basis: /** @type {const} */ ("measured"),
      why: "Tatkal opens about a day before departure",
      evidence:
        "Measured over two real runs, 2026-09-23 and 2026-09-24, on 12301 HWH-NDLS 2A/TQ: the ask pinned at today answered 2 rows both days, while the rolling ask refused at 4 days out and at 7 days out. The GN combo on the same train answered 4 rows at every one of those distances, so the refusal is the quota and not the route.",
      settledBy: "Already settled; re-measure only if the provider changes when Tatkal opens.",
    },
  ],
  [
    "PT",
    {
      basis: /** @type {const} */ ("inferred"),
      why: "Premium Tatkal is sold from the Tatkal window by design",
      evidence: "NOT measured by this project. No PT combo has ever been on the route list, so nothing here has ever asked the provider for one.",
      settledBy:
        "Put one PT combo on the list beside a GN combo on the same train and leg, run for a few days, and compare its rolling ask against its pinned one — exactly as 12301 2A/TQ was compared against 12301 3A/GN. If the rolling ask answers, delete this entry: the sample it costs is worth more than the call it saves.",
    },
  ],
]);

/**
 * Why this combo's ROLLING ask would be a wasted call, or `null` when it would not be.
 *
 * A string rather than a boolean because the run report has to say WHY a combo made one ask instead
 * of two, and the reason belongs beside the table it comes from rather than restated in the report.
 *
 * Looked up through a `Map`, deliberately: `planAsks` runs before `preflight` has checked the quota
 * against the schema, and a plain object would hand `constructor` or `__proto__` an exemption.
 *
 * @param {Route} route
 * @returns {string | null}
 */
export function rollingAskIsPointless(route) {
  const known = QUOTAS_OPENING_NEAR_DEPARTURE.get(route.quota);
  if (known === undefined) return null;
  return `${route.quota} opens close to departure — ${known.why}, ${known.basis} — so the rolling window, which asks days and weeks ahead, can never answer for it`;
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
