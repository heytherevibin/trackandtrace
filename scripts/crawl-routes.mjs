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
