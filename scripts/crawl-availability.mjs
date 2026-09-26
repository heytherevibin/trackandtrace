#!/usr/bin/env node
// Fills the availability observation store: one ask per (train, class, quota, from, to) per stride,
// one row per day the provider answered for. A human can still run it and read what it says, and
// **it is now also scheduled** — daily at 05:30 IST by `.github/workflows/crawl.yml`, decided
// 2026-09-26 on the grounds the header below already gave: the pinned ask is the only source of the
// `days_out = 0` outcome row, and a day nobody ran it is a row that can never be recovered, because
// a past journey date answers 400. The per-day ceiling that made scheduling safe is gate C below.
//
//   node --env-file=.env.local scripts/crawl-availability.mjs
//   (or: npm run source:crawl)
//
// Flags: --routes <file> --cursor <file> --horizon <days> --window <days> --only <n>
//        --start <yyyy-mm-dd> (ignore every cursor and ask this date; for a one-off)
//        --max-calls <n> --daily <n> --reserve <n> --remaining-floor <n> --dry-run
//
// Two asks per combo per run, and the second one is the point:
//
//   * the ROLLING window — each combo's cursor rolls forward a stride a day and wraps at the
//     horizon, which is what gives a journey date several looks at decreasing distances;
//   * an ask PINNED at today, which is the only thing that supplies the `days_out = 0` row the
//     migration calls the outcome — the label a model trains against. The rolling window reaches it
//     for one journey date in twenty; see `planAsks` in `crawl-plan.mjs` for the arithmetic.
//
// On the run a sweep wraps the two are the same date and only one ask is made. **And a combo whose
// quota only opens near departure makes the pinned ask alone, every run** — a Tatkal ask 4 to 57
// days out has nothing to answer, so the rolling one spends a call a run to be refused. For those
// combos the pinned ask IS the sampler; see `QUOTAS_OPENING_NEAR_DEPARTURE` in `crawl-routes.mjs`,
// which says which entries were measured and which inferred.
//
// **Where the rolling window got to lives in the SHARED STORE**, under `…:crawl:cursor`, written
// after every run and read before the next; the pinned ask does not touch it. It was a file until
// 2026-09-26, and a file is still used when no shared store is configured or `--cursor` names one —
// which is what a local run against a scratch path wants. A scheduled runner checks out fresh every
// time, so a file-only cursor is always absent there: the same four days near today, every run,
// with the sixty-day horizon never swept.
//
// Losing it is not a disaster — every combo restarts its sweep at today — but it is a lost
// sweep: the band the cursor was pointing at gets re-read while another band waits a full cycle
// longer. **The run cannot tell you it happened, and this header used to claim otherwise.** A lost
// cursor and a first run are the same input, an empty map, so a missing entry takes `reset: "none"`;
// nothing lands in `restarted` and the run is whole. Only a cursor in the PAST (`behind`) names the
// band it gave up and makes the run un-whole, because only then is there a band to name — and only
// then does the crawler know it had one. Which is why `--start` no longer overwrites the entries it
// was not pointed at (`cursorsForRun`): that was the one way to lose entries silently from inside a
// run that then reported itself whole.
//
// **THE DAY'S BUDGET (gate C).** Before anything is planned, this run reads how many provider calls
// the crawler has already charged to today — one row per call in `crawler_provider_calls`, bucketed
// by IST day by the same SQL expression `observed_on` uses — and takes the SMALLER of its own
// ceiling and what is left of the day. Each call is charged as it is about to leave, never at the
// end, because a process killed mid-run has still spent what it sent. A count that cannot be read
// refuses the run outright. See `crawl-plan.mjs`'s header for the gates,
// `src/services/crawler-budget.ts` for the arithmetic, and **`crawl-spend.mjs` for the enforcement,
// which lives there rather than here precisely so that a test can drive it.**
//
// The consequence an operator will meet: **after one full run, a second run the same day refuses**,
// because the worst case no longer fits in what is left. That is right for a crawler meant to run
// once a day, and it also blocks a legitimate retry after a run a gate cut short — so the refusal
// names the `--only n` that does still fit, and says what `--only` actually selects.
//
// **The count is re-read before every ask, not only at the start.** Read once, it can be out-voted:
// two runs started inside the same window both pass the gate and both spend a whole run — 28 + 28
// against a cap of 33 — and the overrun comes out of what live PNR checks depend on. This is not a
// lock, and it works only because every call writes its row before it leaves: the ledger is
// self-correcting, so re-reading it bounds a concurrent overspend to about one ask instead of a
// whole run, and the run stops mid-way exactly as the burst floor and the per-run ceiling do.
//
// **A run that crosses IST midnight is gated against the day it started on and charges its tail to
// the day it finishes on.** Both halves are honestly recorded — `spent_on` is derived per row, and
// `observed_on` splits at the same instant — but the gate the second half passed was the first
// day's. Run at a stable hour well away from midnight; the runbook says so twice, and this is the
// second reason.
//
// Exit: 0 the run was whole · 1 it was not — a gate stopped it, or a budget refusal turned it away
// before it asked anything · 2 it was asked wrongly, and nothing was spent. A refused run is the
// daily gate WORKING, so it takes 1 and never 2: a wrapper that pages on "called wrongly" must not
// be paged by a second run being correctly refused.
//
// **The exit code is about THIS RUN and nothing else.** After the run it also prints the whole
// store's coverage (`observations-coverage.mjs`), because a run can be perfectly whole while the
// dataset is holed by days nobody ran it — but a holed store does NOT change the code above.
// `npm run source:report` is the check with its own threshold and its own exit code.
//
// This file is only the wiring. The stride, the route preflight, the quota gates, the loop and the
// report all live in `crawl-plan.mjs`, `crawl-run.mjs` and `crawl-report.mjs`, which are pure and
// tested; the day's budget lives in `src/services/crawler-budget.ts` and `crawl-spend.mjs`, and the
// TypeScript import hook in `crawl-imports.mjs` — **read `crawl-plan.mjs`'s header before changing
// anything about what this run is allowed to spend.**
//
// The env file is passed in by the operator exactly as this script's siblings take it, and no key is
// ever read from anywhere else or printed anywhere. Nothing here knows anything about a person.


import { fileURLToPath, pathToFileURL } from "node:url";
import { registerAppImports } from "./crawl-imports.mjs";
import {
  ASKS_PER_COMBO_MAX,
  CALLS_PER_ASK_MAX,
  DEFAULT_DAILY_ALLOWANCE,
  DEFAULT_REMAINING_FLOOR,
  comboKey,
  crawlCeiling,
  loadRouteFile,
  parseRouteFile,
  plannedCalls,
  preflight,
  rollingAskIsPointless,
} from "./crawl-plan.mjs";
import { createCursorStore } from "./crawl-cursor-store.mjs";
import { runCrawl } from "./crawl-run.mjs";
import { STORE_TIMEOUT_MS, createCountingFetch, createDayGate, mayRun } from "./crawl-spend.mjs";
import { dayBudgetLines, exitCodeFor, summarise } from "./crawl-report.mjs";
import { DEFAULT_HORIZON_DAYS, DEFAULT_WINDOW_DAYS, cursorsForRun, cycleRuns, isIsoDate, parseCursors } from "./crawl-window.mjs";
import { coverageReport, parseObservationRows, readObservations, summariseCoverage } from "./observations-coverage.mjs";

const HERE = new URL("./", import.meta.url);

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

/** Asked wrongly: exit 2, nothing spent. Distinguished from a real crash, which must still throw. */
class Misuse extends Error {}

/**
 * A GATE stopped the run: exit 1, nothing spent. Distinguished from `Misuse` because the two mean
 * opposite things to whatever wrapper reads the code. The header's contract has always said 1 is
 * "a refusal, or a gate stopped it" and 2 is "it was asked wrongly" — and a budget refusal went out
 * as 2, so a scheduler that pages on "called wrongly" would have been paged every time a second run
 * that day was correctly refused. The daily gate refusing is the gate WORKING, and the refusal
 * message itself says so; it must not carry the code that means somebody typed the wrong thing.
 */
class Refusal extends Error {}

/**
 * The run was asked wrongly and nothing was spent. It THROWS rather than calling `process.exit(2)`:
 * `console.error` to a pipe is asynchronous in Node and `process.exit` does not drain it, so
 * `npm run source:crawl | tee crawl.log` could lose the very message explaining why the run refused.
 * The entry point at the foot of this file catches it, prints, and sets `process.exitCode`.
 *
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  throw new Misuse(message);
}

/**
 * A gate refused the run. Nothing was spent, and this is a routine outcome rather than a fault.
 *
 * @param {string} message
 * @returns {never}
 */
function refuse(message) {
  throw new Refusal(message);
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
    const read = await readObservations(db, { table, signal: AbortSignal.timeout(STORE_TIMEOUT_MS) });
    if (!read.ok) {
      console.error(`[crawl] the store's coverage could not be read: ${read.reason}`);
      console.error("[crawl] this run is unaffected: its rows are written and its cursor is saved. `npm run source:report` is the check on the store.");
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
  // `parseRouteFile` already refuses an empty `routes` array; the same rule has to survive --only.
  // Without this, `--only 0` asked nothing, rewrote every cursor unchanged, printed "The run was
  // whole" and exited 0 — so a wrapper that computes --only and gets 0 succeeded loudly at nothing.
  if (routes.length === 0) {
    fail(`--only ${limit} leaves no combos to ask, so nothing would be crawled. The route list has ${parsed.routes.length}; ask for at least one.`);
  }
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

  // The cursor goes to the SHARED STORE when there is one, and to a file when there is not.
  //
  // A file was enough while this only ran from a working copy. A scheduled runner checks out fresh
  // every time, so a file-only cursor is always absent there: every run re-asks the same four days
  // near today and the sixty-day horizon is never swept. `--cursor` still forces the file, which is
  // what a one-off local run against a scratch path wants.
  //
  // `publicStore` answers with an IN-MEMORY store when none is configured, under a prefix that
  // looks exactly like the real one — so a cursor written there is lost when the process exits
  // while the banner reports a key as though it were durable. `sharedStoreConfig` is what actually
  // says whether there is a store, and the file is the honest answer when there is not.
  const { publicStore } = await import(new URL("services/shared-store.ts", srcRoot).href);
  const { sharedStoreConfig } = await import(new URL("services/env.ts", srcRoot).href);
  const cursorPath = found.get("cursor") ?? fileURLToPath(new URL("crawl-cursor.json", HERE));
  const durable = !found.get("cursor") && sharedStoreConfig(environment) !== null;
  const shared = durable ? publicStore(environment) : null;
  const cursorStore = createCursorStore({ kv: shared?.kv ?? null, prefix: shared?.prefix ?? "", path: cursorPath });
  const readCursors = parseCursors(await cursorStore.read());
  if (!readCursors.ok) {
    fail(
      `the stored cursor is unusable, so nothing was asked:\n  ${readCursors.issues.join("\n  ")}\n` +
        `It says where each combo's rolling window got to. Fix ${cursorStore.where}, or clear it to restart every sweep at today.`,
    );
  }
  // --start is the one-off escape hatch: ignore every cursor and ask this exact date. The cursors
  // still advance from it, so a mistake costs one run's asks rather than the file.
  const startAt = found.get("start");
  // Validated with the same ISO check `parseCursors` applies. Unvalidated, `--start 24-09-2026` —
  // the provider's own DD-MM-YYYY, which this codebase's own adapter writes, and so the most likely
  // thing to type — made `nextAsk` return today with `reset: "unreadable"`. Every combo then asked
  // today, the cursors advanced from today, the banner still said the override had taken effect, and
  // the one-off the operator wanted simply did not happen. A bare `--start` with no value stored the
  // string "true" and took the same path.
  if (startAt !== undefined && !isIsoDate(startAt)) {
    fail(`--start must be an ISO date (yyyy-mm-dd); got ${startAt}. Nothing was asked.`);
  }
  // Laid ON the stored map, never substituted for it: `routes` is already cut by `--only`, and this
  // object is written back over the whole cursor file below. See `cursorsForRun`.
  const cursors = cursorsForRun({ stored: readCursors.cursors, keys: routes.map(comboKey), startAt });

  const { ceiling: runCeiling, headroom, reason } = crawlCeiling({
    dailyAllowance: whole(found, "daily", DEFAULT_DAILY_ALLOWANCE),
    liveReserve: whole(found, "reserve", liveRequestsPerDay(environment)),
    requested: found.has("max-calls") ? whole(found, "max-calls", 0) : undefined,
  });
  // Two asks a combo — the rolling window, and the ask pinned at today that supplies the
  // days_out = 0 outcome row — except for a combo whose quota only opens near departure, which
  // makes the pinned ask alone. Gate A itself is unchanged; what matters is that the arithmetic
  // handed to it tells the truth about what THIS list will spend, which is why it is given the
  // routes and not merely their number.
  const worstCase = plannedCalls({ routes });
  const pinnedOnly = routes.filter((route) => rollingAskIsPointless(route) !== null);
  const remainingFloor = whole(found, "remaining-floor", DEFAULT_REMAINING_FLOOR);

  // The store, and the crawler's own daily ledger, are proved BEFORE the banner — earlier than they
  // used to be, because gate C has to be consulted before the run is planned and `--dry-run` has to
  // be able to print what the day has already spent. Spending calls we cannot store is the same
  // waste as missing a day, so this order also keeps the older promise.
  //
  // A plain select, deliberately. `select("id", { head: true, count: "exact" })` sends a HEAD
  // request, and a HEAD has no body for the client to read the refusal out of: a table that does
  // not exist answers 204 with `error: null`, and the preflight passes on a store that cannot take
  // a single row. Measured 2026-09-23 against a project missing the migration — it cost six calls
  // to learn.
  const { recordObservations, OBSERVATION_TABLE } = await import(new URL("services/observations.ts", srcRoot).href);
  const { CRAWLER_CALL_TABLE, dayCeiling, readCallsToday, recordProviderCall } = await import(new URL("services/crawler-budget.ts", srcRoot).href);
  const { createAdminSupabase } = await import(new URL("services/supabase/admin.ts", srcRoot).href);

  let db;
  try {
    db = createAdminSupabase();
    const { error } = await db.from(OBSERVATION_TABLE).select("id").limit(1);
    if (error) throw new Error(`${error.message}${error.code ? ` (${error.code})` : ""}`);
  } catch (error) {
    fail(`the observation store cannot take a row, so nothing was asked: ${error.message}`);
  }

  // GATE C: THE DAY. The effective ceiling is the smaller of gate A's and what is left of today.
  // The daily cap is `headroom` — `DEFAULT_DAILY_ALLOWANCE` less the live reserve — which is the
  // very number gate A is built from, so one constant governs both.
  const day = dayCeiling({
    perRunCeiling: runCeiling,
    dailyCap: headroom,
    spent: await readCallsToday(db, today, { signal: AbortSignal.timeout(STORE_TIMEOUT_MS) }),
  });
  // **The decision is `mayRun`, in `crawl-spend.mjs`, because it has to be a decision a test can
  // drive.** Both refusals — an unreadable count, and a worst case over what is left of the day —
  // used to be two lines here, in a file nothing imports: deleting either left all 2262 tests
  // green. The ceiling it hands back is the DAY's, not this run's own.
  const verdict = mayRun({ day, worstCase, routes });

  console.log(`routes         ${routes.length} combo${routes.length === 1 ? "" : "s"}${limit < parsed.routes.length ? ` (of ${parsed.routes.length}, limited by --only)` : ""}`);
  console.log(`window         rolling ${windowDays} days a run over a ${horizonDays}-day horizon — a sweep takes ${cycleRuns(horizonDays, windowDays)} runs`);
  console.log(`pinned         one more ask each at ${today}, which is what supplies the days_out = 0 outcome row (skipped where a sweep wraps onto today)`);
  if (pinnedOnly.length > 0) {
    const quotas = [...new Set(pinnedOnly.map((route) => route.quota))].join(", ");
    console.log(`pinned only    ${pinnedOnly.length} combo${pinnedOnly.length === 1 ? "" : "s"} make the pinned ask and no rolling one: ${quotas} open${quotas.includes(",") ? "" : "s"} too close to departure for a rolling ask to answer`);
    for (const route of pinnedOnly) console.log(`               ${comboKey(route)}`);
  }
  console.log(`cursor         ${cursorStore.where}${Object.keys(readCursors.cursors).length === 0 ? " (none yet: every combo starts at today)" : ""}${startAt === undefined ? "" : ` (overridden for this run: ${startAt})`}`);
  console.log(
    `worst case     ${worstCase} calls (${worstCase / CALLS_PER_ASK_MAX} asks × ${CALLS_PER_ASK_MAX} for the guard's one retry: ${routes.length - pinnedOnly.length} combo${routes.length - pinnedOnly.length === 1 ? "" : "s"} × ${ASKS_PER_COMBO_MAX} asks${pinnedOnly.length === 0 ? "" : `, ${pinnedOnly.length} × 1`})`,
  );
  console.log(`ceiling        ${reason}`);
  // Missing when the count could not be read, which is the refusal printed immediately below: there
  // is no spend to state, and inventing a zero is the one thing gate C must never do.
  if (day.ok) for (const line of dayBudgetLines({ today, dailyCap: day.dailyCap, spentToday: day.spentToday, remainingToday: day.remainingToday, reason: day.reason })) console.log(line);
  console.log(`burst floor    stop when the provider's RateLimit-Remaining reaches ${remainingFloor}`);
  console.log(`store          ${new URL(environment.NEXT_PUBLIC_SUPABASE_URL).host} · ${OBSERVATION_TABLE} · ${CRAWLER_CALL_TABLE}`);

  // The ONE place gate C is enforced, and `refuse` rather than `fail`: a budget refusal is exit 1,
  // the gate working, not exit 2, somebody typing the wrong thing.
  if (!verdict.ok) refuse(verdict.reason);
  const ceiling = verdict.ceiling;
  if (found.has("dry-run")) {
    console.log("\n--dry-run: nothing was asked, so nothing was charged to today's budget. The day's numbers above are what it stood at.");
    return;
  }

  const { createRailKitAvailabilitySource } = await import(new URL("services/sources/railkit-availability.ts", srcRoot).href);
  const { createGuardedSource } = await import(new URL("services/sources/guarded.ts", srcRoot).href);
  const { providerGuard } = await import(new URL("services/shared-store.ts", srcRoot).href);
  console.log("");

  // Every call the adapter makes passes through here: this is the only honest count of what left the
  // process, the only place the provider's own RateLimit headers can be read, and therefore the only
  // honest place to charge the day's budget. **Charged BEFORE the call leaves, and the call is given
  // up if the charge fails** — the reasoning, and the tests that prove a caller acts on it rather
  // than merely computing the right number, are in `crawl-spend.mjs`.
  const counter = createCountingFetch({ record: (spentAt, options) => recordProviderCall(db, spentAt, options) });

  const adapter = createRailKitAvailabilitySource(
    { key: environment.RAILKIT_API_KEY, baseUrl: environment.RAILKIT_BASE_URL, timeoutMs: environment.RAILKIT_TIMEOUT_MS },
    { fetch: counter.fetch },
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
      counter.beginAsk();
      const outcome = await source.check(request);
      return { outcome, calls: counter.calls, remaining: counter.remaining };
    },
    // Gate C again, before every ask. The count above was read once, before planning: two runs
    // started inside the same window both passed it and both spent a whole run. Re-reading the
    // ledger — which every call writes to before it leaves — bounds that to about one ask.
    dayGate: createDayGate({ read: (options) => readCallsToday(db, today, options), dailyCap: day.dailyCap }),
    record: (request, outcome) => recordObservations(request, outcome.answer, db),
  });

  // Written before anything else, and even when the run was not whole: the asks were spent either
  // way, and a cursor that forgets them makes the next run re-ask a band it has already covered.
  try {
    await cursorStore.write(summary.cursors);
  } catch (error) {
    console.error(`[crawl] the run finished but its cursor could not be saved to ${cursorStore.where}: ${error.message}`);
    console.error("[crawl] the next run will restart every sweep at today unless this is fixed.");
  }

  for (const line of summarise(summary)) console.log(line);
  // Said here rather than folded into the summary: `runCrawl` is pure and knows nothing about the
  // ledger, and an ask filed under `notAsked` reads as a resting breaker unless this says otherwise.
  const uncharged = counter.uncharged;
  if (uncharged > 0) {
    console.error(`\n[crawl] ${uncharged} call${uncharged === 1 ? " was" : "s were"} given up because the day's budget could not be charged, so ${uncharged === 1 ? "it was" : "they were"} never sent.`);
    console.error("[crawl] Those asks are in the 'never reached the provider' section above, and their cursors held. Fix the ledger before the next run: a run that cannot count itself is the one thing the daily gate exists to prevent.");
  }
  // The WHOLE route list, never `routes` — that is already cut by `--only`, and a coverage print
  // told a two-combo list would file the other four under "no longer on the route list" (false) and
  // drop them from the fraction, ending a `--only` run with a green coverage line over a holed
  // store. `--only` limits what this run ASKS; it does not limit what the store owes.
  await printStoreCoverage({ db, table: OBSERVATION_TABLE, today, listed: parsed.routes.map(comboKey) });
  // `process.exitCode`, never `process.exit`. The tail of the summary is where the failed combos,
  // the restarted sweeps and "The run was NOT whole" live — and `console.log` to a pipe is
  // asynchronous in Node, which `process.exit` does not drain. The loudness of a partial run must
  // not depend on stdout happening to be a file rather than `| tee crawl.log` or a CI capture.
  process.exitCode = exitCodeFor(summary);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await main();
  } catch (error) {
    if (!(error instanceof Misuse) && !(error instanceof Refusal)) throw error;
    console.error(`[crawl] ${error.message}`);
    process.exitCode = error instanceof Refusal ? 1 : 2;
  }
}
