#!/usr/bin/env node
// Where is the observation store holed? Reads what the crawler has written and says which
// (combo, day) pairs are missing, so a permanent hole is at least a findable one.
//
//   node --env-file=.env.local scripts/observations-report.mjs
//   (or: npm run source:report)
//
// Flags: --routes <file> --today <yyyy-mm-dd> --min-coverage <percent> --max-rows <n>
//        --no-routes (measure whatever the store holds, without a list of what is expected)
//
// Exit: 0 at or above the threshold · 1 below it · 2 it was asked wrongly, or the store could not
// be read whole. A check can be wired to it exactly as one can to `npm run source:health`.
//
// This file is only the wiring. **What counts as a gap, and what that reading cannot see, is
// `observations-coverage.mjs` — read its header before changing any rule.** Everything there is
// pure and unit-tested; nothing here is, which is why nothing here decides anything.
//
// It asks the provider for nothing: this reads our own database, so it costs no quota and can be
// run as often as anyone likes. The env file is passed in by the operator exactly as this script's
// siblings take it, no key is read from anywhere else, and none is ever printed.

import { statSync } from "node:fs";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { comboKey, loadRouteFile, parseRouteFile } from "./crawl-plan.mjs";
import { addDays } from "./crawl-window.mjs";
import { DEFAULT_MAX_ROWS, DEFAULT_MIN_COVERAGE_PCT, coverageReport, exitCodeFor, isCalendarDate, parseObservationRows, readObservations, summariseCoverage } from "./observations-coverage.mjs";

const HERE = new URL("./", import.meta.url);

// ---------------------------------------------------------------------------
// The runner. Everything above is pure; only what follows touches the world.
// ---------------------------------------------------------------------------

/** As `crawl-availability.mjs` does, and for the reasons its header gives at length: the app's own modules, not a second copy of them. */
function registerAppImports(srcRoot) {
  const isFile = (url) => {
    try {
      return statSync(new URL(url)).isFile();
    } catch {
      return false;
    }
  };
  const resolveTs = (url) => [url, `${url}.ts`, `${url}/index.ts`].find(isFile) ?? url;

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@/")) return nextResolve(resolveTs(new URL(specifier.slice(2), srcRoot).href), context);
      const from = context.parentURL;
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && from?.endsWith(".ts")) return nextResolve(resolveTs(new URL(specifier, from).href), context);
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      return url.endsWith(".ts") ? nextLoad(url, { ...context, format: "module-typescript" }) : nextLoad(url, context);
    },
  });
}

function flags(argv) {
  const found = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) found.set(arg.slice(2), "true");
    else {
      found.set(arg.slice(2), next);
      i += 1;
    }
  }
  return found;
}

function fail(message) {
  console.error(`[report] ${message}`);
  process.exit(2);
}

function whole(found, name, fallback) {
  const raw = found.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) fail(`--${name} must be a whole number; got ${raw}`);
  return value;
}

/** Today in India: `observed_on` is an IST calendar day, so the day being measured has to be one too. */
function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function main() {
  const found = flags(process.argv.slice(2));
  const srcRoot = new URL("../src/", HERE);
  registerAppImports(srcRoot);

  const { parseEnv } = await import(new URL("services/env.ts", srcRoot).href);
  const parsedEnv = parseEnv(process.env);
  if (!parsedEnv.ok) fail(`the environment is not valid:\n  ${parsedEnv.issues.join("\n  ")}\nPass one with --env-file, as the sibling scripts do.`);
  const environment = parsedEnv.env;

  const today = found.get("today") ?? istToday();
  if (!isCalendarDate(today)) fail(`--today must be an ISO date; got ${today}`);
  const minCoveragePct = whole(found, "min-coverage", DEFAULT_MIN_COVERAGE_PCT);
  if (minCoveragePct > 100) fail(`--min-coverage is a percentage, 0 to 100; got ${minCoveragePct}`);

  /** @type {string[] | null} */
  let listed = null;
  if (!found.has("no-routes")) {
    const parsed = parseRouteFile(loadRouteFile(found.get("routes") ?? undefined));
    if (!parsed.ok) fail(`the route list is unusable, so there is nothing to compare the store against:\n  ${parsed.issues.join("\n  ")}\nPass --no-routes to measure only what the store already holds.`);
    listed = parsed.ok ? parsed.routes.map(comboKey) : null;
  }

  const { OBSERVATION_TABLE } = await import(new URL("services/observations.ts", srcRoot).href);
  const { createAdminSupabase } = await import(new URL("services/supabase/admin.ts", srcRoot).href);

  // The message that comes back is `createAdminSupabase`'s own, and it still talks about account
  // deletion — that client was written for it and later given the observation store as well. What
  // is missing is said here rather than left to be guessed from it. Names only: never a value.
  let db;
  try {
    db = createAdminSupabase();
  } catch (error) {
    fail(`the observation store cannot be reached: ${error.message}\nThis reads the store with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY. Pass an env file holding them with --env-file, as the sibling scripts do.`);
  }

  console.log(`store          ${new URL(environment.NEXT_PUBLIC_SUPABASE_URL).host} · ${OBSERVATION_TABLE}`);
  console.log(`measured to    ${addDays(today, -1)} (today, ${today}, is still open)`);
  console.log(`expected       ${listed === null ? "whatever the store holds (--no-routes)" : `${listed.length} combo${listed.length === 1 ? "" : "s"} on the route list`}`);

  const read = await readObservations(db, { table: OBSERVATION_TABLE, maxRows: whole(found, "max-rows", DEFAULT_MAX_ROWS) });
  if (!read.ok) fail(read.reason);

  const parsed = parseObservationRows(read.ok ? read.rows : []);
  if (!parsed.ok) fail(`the store holds rows this report cannot read:\n  ${parsed.issues.slice(0, 10).join("\n  ")}`);

  const report = coverageReport({ rows: parsed.ok ? parsed.rows : [], today, listed, minCoveragePct });
  console.log(`rows read      ${report.rows}`);
  for (const line of summariseCoverage(report)) console.log(line);
  process.exit(exitCodeFor(report));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
