#!/usr/bin/env node
// Fills the availability observation store: one ask per (train, class, quota, from, to) per stride,
// one row per day the provider answered for. A human runs this and reads what it says — it is
// deliberately NOT scheduled, which is a later decision, after a few supervised runs show what it
// actually costs.
//
//   node --env-file=.env.local scripts/crawl-availability.mjs
//   (or: npm run source:crawl)
//
// Flags: --routes <file> --cursor <file> --horizon <days> --window <days> --only <n>
//        --start <yyyy-mm-dd> (ignore every cursor and ask this date; for a one-off)
//        --max-calls <n> --daily <n> --reserve <n> --remaining-floor <n> --dry-run
//
// One ask per combo per run: each combo's window rolls forward a stride a day and wraps at the
// horizon. **Where it got to lives in `scripts/crawl-cursor.json`**, written after every run and
// read before the next. Losing that file is not a disaster — every combo restarts at today — but it
// is a lost sweep, so it is not something to delete casually. It is gitignored: it is this
// machine's record of what it has asked, not source.
//
// Exit: 0 the run was whole · 1 it was not (a refusal, or a gate stopped it) · 2 it was asked
// wrongly, and nothing was spent.
//
// **The exit code is about THIS RUN and nothing else.** After the run it also prints the whole
// store's coverage (`observations-coverage.mjs`), because a run can be perfectly whole while the
// dataset is holed by days nobody ran it — but a holed store does NOT change the code above.
// `npm run source:report` is the check with its own threshold and its own exit code.
//
// This file is only the wiring. The stride, the route preflight, the two quota gates, the loop and
// the report all live in `crawl-plan.mjs`, which is pure and tested — **read its header before
// changing anything about what this run is allowed to spend.**
//
// The env file is passed in by the operator exactly as this script's siblings take it, and no key is
// ever read from anywhere else or printed anywhere. Nothing here knows anything about a person.

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CALLS_PER_ASK_MAX,
  DEFAULT_DAILY_ALLOWANCE,
  DEFAULT_REMAINING_FLOOR,
  comboKey,
  crawlCeiling,
  exitCodeFor,
  loadRouteFile,
  parseRouteFile,
  plannedCalls,
  preflight,
  runCrawl,
  summarise,
} from "./crawl-plan.mjs";
import { DEFAULT_HORIZON_DAYS, DEFAULT_WINDOW_DAYS, cycleRuns, parseCursors } from "./crawl-window.mjs";
import { coverageReport, parseObservationRows, readObservations, summariseCoverage } from "./observations-coverage.mjs";

const HERE = new URL("./", import.meta.url);

/**
 * Lets this script import the app's own TypeScript — the adapter, the recorder, the guard — rather
 * than growing a second copy of them that would drift. A second copy of the breaker's key layout is
 * exactly how a crawler would end up writing to the PNR fuse by accident.
 *
 * Node strips the types; these two rules are what tsconfig's `paths` and `moduleResolution: bundler`
 * do for the app, and nothing more.
 *
 * Node strips types rather than compiling them, so a TypeScript **parameter property**
 * (`constructor(private readonly x: T) {}`) is a syntax error it cannot get past — and it fails at
 * import, before a single request is spent. `MemoryCache`, `MemoryKv`, `EncryptedRedisCache` and
 * `SharedRateLimiter` therefore assign their fields explicitly. Keep it that way: the alternative is
 * this script carrying its own copy of the shared store's key names.
 */
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

function whole(found, name, fallback) {
  const raw = found.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) fail(`--${name} must be a whole number; got ${raw}`);
  return value;
}

function fail(message) {
  console.error(`[crawl] ${message}`);
  process.exit(2);
}

/** Today in India: a journey date is an Indian calendar date, and a date the provider has closed answers 400. */
function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * What the STORE looks like, after this run has written to it.
 *
 * The report above is about the run: it can say "the run was whole" while the dataset has holes
 * from days nobody ran the crawler at all — and those are the holes that can never be filled, since
 * a past journey date answers 400. This closes that blindness. It costs nothing on the provider's
 * plan (it reads our own database), and it runs after the crawl, never before its preflight.
 *
 * **It never changes the run's exit code.** A failure to read the store is printed and stepped over
 * for the same reason: the crawl's own verdict must not depend on a second thing being healthy.
 */
async function printStoreCoverage({ db, table, today, listed }) {
  try {
    const read = await readObservations(db, { table });
    if (!read.ok) {
      console.error(`[crawl] the store's coverage could not be read: ${read.reason}`);
      return;
    }
    const parsed = parseObservationRows(read.rows);
    if (!parsed.ok) {
      console.error(`[crawl] the store holds rows the coverage report cannot read: ${parsed.issues.slice(0, 3).join("; ")}`);
      return;
    }
    const coverage = coverageReport({ rows: parsed.rows, today, listed });
    for (const line of summariseCoverage(coverage)) console.log(line);
    if (!coverage.enough) {
      console.log("\nThe STORE is below its coverage threshold, which this run's exit code does not report: 0 or 1 here still means only whether THIS run was whole.");
      console.log("`npm run source:report` is the check that fails on the store.");
    }
  } catch (error) {
    console.error(`[crawl] the store's coverage could not be read: ${error.message}`);
  }
}

/** Absent is the normal first run: every combo starts at today. Unreadable is not, and is refused. */
function readCursorFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const found = flags(process.argv.slice(2));
  const srcRoot = new URL("../src/", HERE);
  registerAppImports(srcRoot);

  const { parseEnv, liveRequestsPerDay } = await import(new URL("services/env.ts", srcRoot).href);
  const { bookingClassSchema, quotaSchema } = await import(new URL("types/schemas.ts", srcRoot).href);

  // The app's own `env()` falls back to defaults outside production, which would quietly drop the
  // key and run this against nothing. A crawler must refuse instead.
  const parsedEnv = parseEnv(process.env);
  if (!parsedEnv.ok) fail(`the environment is not valid:\n  ${parsedEnv.issues.join("\n  ")}\nPass one with --env-file, as the sibling scripts do.`);
  const environment = parsedEnv.env;
  if (!environment.RAILKIT_API_KEY) fail("RAILKIT_API_KEY is not set, so there is nothing to ask. Run through `node --env-file=.env.local`, and never commit the key.");

  const parsed = parseRouteFile(loadRouteFile(found.get("routes") ?? undefined));
  if (!parsed.ok) fail(`the route list is unusable:\n  ${parsed.issues.join("\n  ")}`);

  const limit = whole(found, "only", parsed.routes.length);
  const routes = parsed.routes.slice(0, limit);
  const issues = preflight(routes, { classes: bookingClassSchema.options, quotas: quotaSchema.options });
  if (issues.length > 0) {
    fail(
      `the route list fails preflight, so nothing was asked:\n  ${issues.join("\n  ")}\n` +
        "A bad entry must cost the preflight, not the budget: the guard counts a request before the adapter sees it, so a malformed route spends quota on a call that never happens.",
    );
  }

  const horizonDays = whole(found, "horizon", parsed.horizonDays ?? DEFAULT_HORIZON_DAYS);
  const windowDays = whole(found, "window", DEFAULT_WINDOW_DAYS);
  const today = istToday();
  if (horizonDays < 1 || windowDays < 2) fail("--horizon must be at least 1 and --window at least 2");

  const cursorPath = found.get("cursor") ?? fileURLToPath(new URL("crawl-cursor.json", HERE));
  const readCursors = parseCursors(readCursorFile(cursorPath));
  if (!readCursors.ok) {
    fail(
      `the cursor file is unusable, so nothing was asked:\n  ${readCursors.issues.join("\n  ")}\n` +
        `It says where each combo's rolling window got to. Fix ${cursorPath}, or delete it to restart every sweep at today.`,
    );
  }
  // --start is the one-off escape hatch: ignore every cursor and ask this exact date. The cursors
  // still advance from it, so a mistake costs one run's asks rather than the file.
  const startAt = found.get("start");
  const cursors = startAt === undefined ? readCursors.cursors : Object.fromEntries(routes.map((r) => [comboKey(r), { next: startAt, refusals: readCursors.cursors[comboKey(r)]?.refusals ?? 0 }]));

  const { ceiling, reason } = crawlCeiling({
    dailyAllowance: whole(found, "daily", DEFAULT_DAILY_ALLOWANCE),
    liveReserve: whole(found, "reserve", liveRequestsPerDay(environment)),
    requested: found.has("max-calls") ? whole(found, "max-calls", 0) : undefined,
  });
  const worstCase = plannedCalls({ combos: routes.length });
  const remainingFloor = whole(found, "remaining-floor", DEFAULT_REMAINING_FLOOR);

  console.log(`routes         ${routes.length} combo${routes.length === 1 ? "" : "s"}${limit < parsed.routes.length ? ` (of ${parsed.routes.length}, limited by --only)` : ""}`);
  console.log(`window         one ask each, rolling ${windowDays} days a run over a ${horizonDays}-day horizon — a sweep takes ${cycleRuns(horizonDays, windowDays)} runs`);
  console.log(`cursor         ${cursorPath}${Object.keys(readCursors.cursors).length === 0 ? " (none yet: every combo starts at today)" : ""}${startAt === undefined ? "" : ` (overridden for this run: ${startAt})`}`);
  console.log(`worst case     ${worstCase} calls (${routes.length} × ${CALLS_PER_ASK_MAX} for the guard's one retry)`);
  console.log(`ceiling        ${reason}`);
  console.log(`burst floor    stop when the provider's RateLimit-Remaining reaches ${remainingFloor}`);

  if (worstCase > ceiling) {
    fail(
      `this run's worst case (${worstCase} calls) is over its ceiling (${ceiling}). Nothing was asked.\n` +
        "Cut the list with --only, or state a wider share of the plan with --reserve — and say out loud how many live checks that leaves unprotected.",
    );
  }
  if (found.has("dry-run")) {
    console.log("\n--dry-run: nothing was asked.");
    process.exit(0);
  }

  const { createRailKitAvailabilitySource } = await import(new URL("services/sources/railkit-availability.ts", srcRoot).href);
  const { createGuardedSource } = await import(new URL("services/sources/guarded.ts", srcRoot).href);
  const { providerGuard } = await import(new URL("services/shared-store.ts", srcRoot).href);
  const { recordObservations, OBSERVATION_TABLE } = await import(new URL("services/observations.ts", srcRoot).href);
  const { createAdminSupabase } = await import(new URL("services/supabase/admin.ts", srcRoot).href);

  // Spending calls we cannot store is the same waste as missing a day, so the store is proved first.
  //
  // A plain select, deliberately. `select("id", { head: true, count: "exact" })` sends a HEAD
  // request, and a HEAD has no body for the client to read the refusal out of: a table that does
  // not exist answers 204 with `error: null`, and the preflight passes on a store that cannot take
  // a single row. Measured 2026-09-23 against a project missing the migration — it cost six calls
  // to learn.
  let db;
  try {
    db = createAdminSupabase();
    const { error } = await db.from(OBSERVATION_TABLE).select("id").limit(1);
    if (error) throw new Error(`${error.message}${error.code ? ` (${error.code})` : ""}`);
  } catch (error) {
    fail(`the observation store cannot take a row, so nothing was asked: ${error.message}`);
  }
  console.log(`store          ${new URL(environment.NEXT_PUBLIC_SUPABASE_URL).host} · ${OBSERVATION_TABLE}\n`);

  // Every call the adapter makes passes through here: this is the only honest count of what left the
  // process, and the only place the provider's own RateLimit headers can be read.
  let callsThisAsk = 0;
  let lastRemaining = null;
  const countingFetch = async (input, init) => {
    if (callsThisAsk >= CALLS_PER_ASK_MAX) {
      // Unreachable while the loop's own arithmetic holds. If it ever fires, that arithmetic is
      // wrong and the run must fail closed rather than keep spending.
      throw Object.assign(new Error("the per-ask call bound was exceeded"), { name: "AbortError" });
    }
    callsThisAsk += 1;
    const response = await fetch(input, init);
    lastRemaining = response.headers.get("ratelimit-remaining");
    return response;
  };

  const adapter = createRailKitAvailabilitySource(
    { key: environment.RAILKIT_API_KEY, baseUrl: environment.RAILKIT_BASE_URL, timeoutMs: environment.RAILKIT_TIMEOUT_MS },
    { fetch: countingFetch },
  );
  // "availability", never "pnr": Task 3 split the fuses so this run's refusals rest this caller and
  // not a traveller's PNR check. Only a refused key or a spent plan reaches the shared fuse, which
  // is exactly what the two gates above exist to keep this run away from.
  const source = createGuardedSource(adapter, providerGuard("railkit", "availability", environment));

  const summary = await runCrawl({
    routes,
    cursors,
    today,
    horizonDays,
    windowDays,
    ceiling,
    remainingFloor,
    ask: async (request) => {
      callsThisAsk = 0;
      lastRemaining = null;
      const outcome = await source.check(request);
      return { outcome, calls: callsThisAsk, remaining: lastRemaining };
    },
    record: (request, outcome) => recordObservations(request, outcome.answer, db),
  });

  // Written before anything else, and even when the run was not whole: the asks were spent either
  // way, and a cursor that forgets them makes the next run re-ask a band it has already covered.
  try {
    writeFileSync(cursorPath, `${JSON.stringify(summary.cursors, null, 2)}\n`);
  } catch (error) {
    console.error(`[crawl] the run finished but its cursor could not be saved to ${cursorPath}: ${error.message}`);
    console.error("[crawl] the next run will restart every sweep at today unless this is fixed.");
  }

  for (const line of summarise(summary)) console.log(line);
  await printStoreCoverage({ db, table: OBSERVATION_TABLE, today, listed: routes.map(comboKey) });
  process.exit(exitCodeFor(summary));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
