// The availability crawler's plan: the rolling window and the pinned outcome ask, the route list and
// its preflight, the two gates that keep the run off the provider's plan, and the loop that walks it.
//
// What a run SAYS about itself is `crawl-report.mjs`, which this file grew out of when it crossed
// 500 lines.
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
//      live PNR checks are allowed to spend, capped at ABSOLUTE_MAX_CALLS_PER_RUN, which is one
//      day of the plan. **No flag can raise it**: `--max-calls` may only lower it and `--daily` is
//      clamped at `DEFAULT_DAILY_ALLOWANCE`, so a stray zero cannot widen the gate. Widening it is
//      `--reserve`'s job, because that is a decision and says out loud what it leaves unprotected.
//      The runner refuses to start when the worst case exceeds the ceiling, and `runCrawl` reserves
//      `callsPerAsk` BEFORE beginning an ask, so calls can never exceed it.
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
// a scheduled crawler needs a shared daily counter of its own, and that counter must exist BEFORE
// the first unattended run, not after the first spent month.
//
// **Why its own counter, corrected:** not because `usage.ts` counts both callers together — it does
// not. `shared-store.ts` prefixes every key with `tt:${VERCEL_ENV ?? NODE_ENV}`, and `env.ts`
// defaults `NODE_ENV` to `development`, so a crawler run locally increments
// `tt:development:usage:railkit:<day>` while production increments `tt:production:usage:railkit:<day>`.
// Worse: with no Upstash credentials `sharedStoreConfig` returns null and the count goes to an
// in-process `Map` that is discarded at exit. So the crawler's spend reaches NO counter anyone would
// look at, and production's usage number under-reports the plan's real consumption by this run's
// entire cost — which cannot be reconciled after the fact either. The first symptom is the 429 that
// rests both callers.
//
// The good half of the same mechanism is worth keeping in view: because the prefixes differ, a local
// crawler's breaker writes cannot reach the production fuses. The only channel from this crawler to
// a traveller's PNR check is the provider's own plan — which is exactly what gates A and B are for.
//
// One more leak this is designed around: `guarded.ts` calls `countRequest()` BEFORE `source.check()`,
// and the adapter returns INVALID before any fetch. A malformed route therefore spends the
// provider's daily usage count on a call that never happens. That is why a bad entry fails the
// PREFLIGHT, before anything is spent, and why asks and calls are reported separately.
//
// No personal data: this is about berths. There is no PNR here, no user, no passenger.

import { comboKey, rollingAskIsPointless } from "./crawl-routes.mjs";
import { addDays, advanceCursor, cycleRuns, daysBetween, nextAsk } from "./crawl-window.mjs";

// The route list is its own file, but this one stays the scripts' single entry point for the plan:
// `observations-coverage.mjs` and `observations-report.mjs` already import `comboKey` and the route
// reader from here, and a split should not make three files change to move one function.
export { QUOTAS_OPENING_NEAR_DEPARTURE, comboKey, loadRouteFile, parseRouteFile, preflight, rollingAskIsPointless } from "./crawl-routes.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** `guarded.ts` retries a check at most once, so one ask costs at most two calls. */
export const CALLS_PER_ASK_MAX = 2;
/**
 * Asks per combo per run: the rolling window, and the ask pinned at today that supplies the
 * `days_out = 0` outcome row. See `planAsks`. On run 0 of a sweep they are the same date and only
 * one is made, so this is a worst case and not an average — and a combo whose quota only opens near
 * departure makes the pinned ask alone, every run (`QUOTAS_OPENING_NEAR_DEPARTURE`).
 */
export const ASKS_PER_COMBO_MAX = 2;
/**
 * Advance is 10,000 a month ≈ 333 a day, shared with live traveller traffic. The reserve subtracted
 * from it is not a constant here: it is `LIVE_REQUESTS_PER_DAY` (300), read from the environment, so
 * the crawler's headroom moves whenever the live budget does.
 *
 * **This is also the ceiling on `--daily` itself.** The flag DESCRIBES the plan; it does not decide
 * anything, so it may lower this number and may never raise it. That is the whole of the rule: a
 * stray zero in `--daily 3330` used to compute `3330 - 300 = 3030` headroom and free the run up to
 * the absolute cap; now it is clamped back to 333, the ceiling is unchanged, and the run says out
 * loud that the flag was ignored. Widening the gate is `--reserve`'s job, because `--reserve` is a
 * decision — it states how many live PNR checks are being left unprotected.
 *
 * If the plan itself is ever upgraded, this constant is what changes. A plan is source, not a flag.
 */
export const DEFAULT_DAILY_ALLOWANCE = 333;
/**
 * Nothing a flag can say makes one run worth more than this. The last line of the gate.
 *
 * **One day of the plan, and not a call more.** It was 500 — 1.5× the entire daily plan it was
 * supposed to backstop, and 15× the 33/day the design reserves for crawling — so it capped nothing
 * the design cares about. A backstop above the thing it backstops is not a backstop.
 */
export const ABSOLUTE_MAX_CALLS_PER_RUN = DEFAULT_DAILY_ALLOWANCE;
/** RailKit's bucket is 600 per 10 minutes; this much of it is left standing for live checks. */
export const DEFAULT_REMAINING_FLOOR = 50;
/**
 * How many runs in a row a combo may refuse before the report calls it a bad list entry.
 *
 * Measured: 12951 answers `Unable to process your request` for every class and date tried. With one
 * rolling ask per combo per run, "always refuses" can only be counted ACROSS runs — which is the
 * other thing the cursor file is for.
 *
 * Two rules keep the count pointed at that and nothing else, and `runCrawl` is where both live:
 *
 *   * **Only the ROLLING ask feeds this count.** A pinned ask at today may refuse because the train
 *     does not run today, which is a fact about the calendar and not about the list.
 *   * **A combo that ANSWERED any ask this run takes no strike at all**, and its count goes back to
 *     zero. The provider demonstrably knows the route, so a refusal of its rolling ask is not
 *     evidence of a bad entry. Measured: both Tatkal combos on the shipped list reached 2 while
 *     answering their pinned ask every single run.
 */
export const REFUSALS_BEFORE_STALE = 3;

// ---------------------------------------------------------------------------
// The shapes, written down so the tests that import this file are checked
// against them rather than against whatever TypeScript can infer from a literal.
// ---------------------------------------------------------------------------

/** @typedef {import("./crawl-routes.mjs").Route} Route */
/** @typedef {{ trainNo: string, from: string, to: string, journeyDate: string, travelClass: string, quota: string }} AskRequest */
/** @typedef {{ ok: true, answer: unknown }} Answered */
/** @typedef {{ ok: false, code: string, message: string, cause?: string, status?: number }} Refused */
/** @typedef {Answered | Refused} Outcome */
/** @typedef {{ outcome: Outcome, calls: number, remaining?: string | null }} AskResult */
/** @typedef {"rolling" | "pinned"} AskKind */
/** `sole` is set only on a pinned ask that is its combo's ONLY ask, and says why. See `planAsks`. */
/** @typedef {{ combo: string, route: Route, date: string, kind: AskKind, reset: "none" | "beyond" | "behind" | "unreadable", sole?: string }} PlannedAsk */
/** @typedef {{ combo: string, date: string, code: string, why: string }} Failure */
/** A rolling refusal that took no staleness strike, because the same combo answered another ask. */
/** @typedef {{ combo: string, date: string, refusals: number }} Excused */
/** @typedef {{ combo: string, kind: AskKind, date: string, code: string, why: string, rested: boolean }} NotAsked */
/** An ask that was planned and never reached, because a gate stopped the run before it came round. */
/** @typedef {{ combo: string, kind: AskKind, date: string }} Forfeited */
/** @typedef {{ combo: string, kind: AskKind, date: string, daysOut: number, rows: number, sole?: string }} Asked */
/** @typedef {{ combo: string, date: string, days: number }} ShortWindow */
/** @typedef {{ combo: string, reason: "behind" | "unreadable", cursor: string, gaveUp: string | null }} Restart */
/** @typedef {import("./crawl-window.mjs").CursorEntry} CursorEntry */
/** @typedef {import("./crawl-window.mjs").Cursors} Cursors */
/**
 * @typedef {{
 *   today: string, horizonDays: number, windowDays: number,
 *   listed: number, planned: number, combos: number, asks: number, calls: number, rows: number,
 *   asked: Asked[], failures: Failure[], pinnedFailures: Failure[], notAsked: NotAsked[], forfeited: Forfeited[],
 *   shortWindows: ShortWindow[], excused: Excused[],
 *   wrapped: string[], restarted: Restart[], stale: string[], cursors: Cursors, stopped: string | null,
 *   remaining: number | null, whole: boolean
 * }} Summary
 */

// ---------------------------------------------------------------------------
// What a run asks for
// ---------------------------------------------------------------------------

/**
 * Every ask this run intends to make, decided before a single call is spent. **Two per combo**, and
 * the second one is not optional.
 *
 * `rolling` is the window this combo's cursor points at — the sweep, unchanged.
 *
 * `pinned` is a second ask at TODAY, every combo, every run. It exists because of one piece of
 * arithmetic: `days_out = 0` — the row the migration calls **the outcome**, the label a model trains
 * against — requires the ask date to equal today, and `nextAsk` returns today only when a sweep
 * wraps. That is run 0 of a sweep: one journey date in `cycleRuns`, on a phase that locks on the
 * first run and never drifts, so the same residue class is starved for ever. Measured over 200 runs
 * at `H=60, W=4`: **133 of 140** steady-state journey dates never got an outcome row, and a past
 * date answers 400, so none of them can be refilled. The pinned ask covers `days_out` 0..3, so every
 * journey date gets its outcome row on the day it departs — **on every day the crawler runs.**
 *
 * That condition is the whole of what changed. The label no longer depends on where the sweep
 * happens to be, which is why it used to fail silently; it depends on somebody running this. A
 * skipped day costs one outcome row per combo, permanently: miss one day in seven and 20 of those
 * 140 journey dates go unlabelled. Nothing later can fill them, which is why `npm run source:report`
 * exists and why a missed day is worth an alarm rather than a shrug.
 *
 * Two consequences, both load-bearing:
 *
 *   * **The pinned ask does not move the cursor.** The sweep is unchanged; `runCrawl` advances only
 *     on the rolling ask.
 *   * **On run 0 of a sweep the two asks are the same date, so only one is planned.** A duplicate is
 *     a wasted call against a plan that funds very few.
 *
 * **And some combos make the pinned ask ALONE.** A quota that only goes on sale close to departure
 * — `QUOTAS_OPENING_NEAR_DEPARTURE`, TQ on measurement and PT on inference — has nothing to say in
 * the band the rolling window asks in, so that ask refuses about 19 runs in 20 and spends a call
 * each time to say so. For those combos the pinned ask IS the sampler, already pointed exactly
 * where the quota lives (`days_out` 0..3). Such a step carries `sole`: the reason, so the report
 * can say why a combo made one ask instead of two. That is a BUDGET decision and it uses domain
 * knowledge; what keeps a Tatkal combo off the stale list needs neither and lives in `runCrawl`.
 *
 * **The one thing this rests on, and it is now measured: a train that has already departed still
 * answers for today.** The label exists only if today is inside the pinned answer, so a morning
 * departure crawled in the evening was the open risk — the provider returns "the next days the
 * train runs, at or after the date asked for", and a *past* date is a hard 400, so dropping an
 * already-departed day would have been plausible. If it did, that combo would never get an outcome
 * row and nothing on this branch would notice: the ask succeeds, four rows land, and `shortWindows`
 * is computed for rolling asks only. Measured on a real run on 2026-09-23 at **22:00 IST**: 12051
 * DR–MAO departs about **05:25**, seventeen hours earlier, and still returned a `days_out = 0` row
 * (`WAITLIST can_book=false`). All six combos got one, at departure times spanning 05:25 to 22:00.
 * One day across six trains is what stands behind it; `crawl-plan.test.ts` models that provider —
 * a train that does not run every day, answering from today whenever today is a running day.
 *
 * @param {{ routes: readonly Route[], cursors: Cursors, today: string, horizonDays: number, windowDays: number }} at
 * @returns {PlannedAsk[]}
 */
export function planAsks({ routes, cursors, today, horizonDays, windowDays }) {
  cycleRuns(horizonDays, windowDays);
  /** @type {PlannedAsk[]} */
  const plan = [];
  for (const route of routes) {
    const combo = comboKey(route);
    const pointless = rollingAskIsPointless(route);
    if (pointless !== null) {
      plan.push({ combo, route, date: today, kind: "pinned", reset: "none", sole: pointless });
      continue;
    }
    const { date, reset } = nextAsk({ cursor: cursors[combo]?.next, today, horizonDays, windowDays });
    plan.push({ combo, route, date, kind: "rolling", reset });
    if (date !== today) plan.push({ combo, route, date: today, kind: "pinned", reset: "none" });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Gate A: the month
// ---------------------------------------------------------------------------

/**
 * How many provider calls this run may make.
 *
 * The plan's day, less what live PNR checks are allowed to spend, capped absolutely. **No flag may
 * raise it.** `--max-calls` (`requested`) may only lower it, and `--daily` is clamped at
 * `DEFAULT_DAILY_ALLOWANCE` — a ceiling a flag can raise is not a ceiling, and widening it means
 * saying out loud, through `--reserve`, how many live checks are being left unprotected.
 *
 * @param {{ dailyAllowance: number, liveReserve: number, requested?: number }} plan
 * @returns {{ ceiling: number, headroom: number, reason: string }}
 */
export function crawlCeiling({ dailyAllowance, liveReserve, requested }) {
  const stated = Math.trunc(dailyAllowance);
  const plan = Math.min(stated, DEFAULT_DAILY_ALLOWANCE);
  const reserve = Math.max(0, Math.trunc(liveReserve));
  const headroom = Math.max(0, plan - reserve);
  const capped = Math.min(headroom, ABSOLUTE_MAX_CALLS_PER_RUN);
  const ceiling = requested === undefined ? capped : Math.max(0, Math.min(Math.trunc(requested), capped));
  // Clamping silently would leave an operator believing a typo had taken effect, so the run says so.
  const ignored = stated > DEFAULT_DAILY_ALLOWANCE ? ` (--daily ${stated} ignored: no flag may raise the plan above ${DEFAULT_DAILY_ALLOWANCE}; --reserve is the deliberate way to widen this gate)` : "";
  const reason =
    capped === 0
      ? `0 calls: the whole plan (${plan} a day) is reserved for live PNR checks, so there is nothing to crawl with`
      : `${ceiling} calls: ${plan} a day on the plan${ignored}, less ${reserve} reserved for live PNR checks` +
        (requested !== undefined && requested < capped ? `, lowered to ${ceiling} by --max-calls` : "");
  return { ceiling, headroom, reason };
}

/**
 * The worst case for one run: every ask a combo can make, and the one retry `guarded.ts` allows each.
 *
 * This is the whole difference the sparse strategy makes. A dense sweep multiplied this by
 * `ceil(horizon / window)` — fifteen — so a default ceiling of 33 funded two combos. Two asks per
 * combo — the rolling window and the pinned outcome row — funds eight.
 *
 * **Hand it `routes` wherever they are in hand.** A combo whose quota only opens near departure
 * makes one ask, not two, so counting the list rather than its length is the truth about what the
 * run will spend — and a ceiling told a run is more expensive than it is refuses a list that fits.
 * `combos` remains for the arithmetic itself: N combos that each make both asks.
 *
 * @param {{ routes?: readonly Route[], combos?: number, callsPerAsk?: number, asksPerCombo?: number }} plan
 * @returns {number}
 */
export function plannedCalls({ routes, combos = 0, callsPerAsk = CALLS_PER_ASK_MAX, asksPerCombo = ASKS_PER_COMBO_MAX }) {
  const asks = routes === undefined ? combos * asksPerCombo : routes.reduce((n, route) => n + (rollingAskIsPointless(route) === null ? asksPerCombo : 1), 0);
  return asks * callsPerAsk;
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
 * Of the asks that spent no call, which ones were held back by the GUARD rather than refused by
 * the adapter — and so mean that every remaining ask would be held back too.
 *
 * **`calls === 0` is the right signal for the cursor and the strike, and the wrong one for this.**
 * Zero calls says exactly one thing, and it is the thing those two decisions turn on: nothing left
 * the process, so the provider never saw this date. It does not say why, and there are exactly two
 * ways to get it through `createGuardedSource(railkitAvailability)`:
 *
 *   * the breaker is open, so `admit()` refused and nothing was sent — blameless, and a GATE: it is
 *     open for every combo at once, so continuing walks the rest of the list for nothing;
 *   * `normalise` refused the route, so the adapter returned `INVALID` before any fetch — the route
 *     is at fault, and that is ONE BAD ENTRY, which must never cost the rest of the list.
 *
 * Nothing else reaches here at zero calls: `countRequest()` throwing would reject the ask rather
 * than answer it, and every other arm of the adapter is downstream of `fetch`. The second one is
 * currently unreachable from this crawler — `preflight` applies every rule `normalise` applies,
 * before a call is spent — which is precisely why it must not be folded into the first: if the
 * preflight ever loosens, a malformed route would otherwise be filed as "blameless" for ever.
 *
 * **Identified POSITIVELY, and this is the whole point of the function.** The obvious rule —
 * `code !== INVALID` — says "everything except one known route error is the gate", which fails
 * OPEN: rename or narrow that code and a single bad entry silently starts stopping the whole run,
 * the same family of defect as treating a rest like a refusal. Nothing binds `Refused.code` (a bare
 * string here) to the adapter's union, so no test would catch the flip.
 *
 * So the gate is named by its own shape instead. `guarded.ts:59` is the only `SOURCE_UNAVAILABLE`
 * in this codebase built without a `cause` — every other one goes through `outcome.ts`'s
 * `unavailable(message, cause, …)`, which always sets one. A causeless `SOURCE_UNAVAILABLE` is
 * therefore the guard's rest and nothing else, and any future shape falls through to "not the
 * gate": the run continues, which wastes a walk down the list and costs no data. That is the
 * direction this must fail in.
 *
 * Neither one moves a cursor or earns a strike; they differ only in whether the run goes on.
 *
 * @param {Refused} outcome
 * @returns {boolean}
 */
function restedOnTheGate(outcome) {
  return outcome.code === "SOURCE_UNAVAILABLE" && outcome.cause === undefined;
}

/**
 * Walks the plan once: for each combo, the single date its cursor points at, and the pinned ask at
 * today that supplies the outcome row.
 *
 * `ask` and `record` are injected so the loop, the gates and the report are testable without a
 * network or a database. `ask` returns `{ outcome, calls, remaining }`: `calls` is how many requests
 * actually left the process for that ask (0 when the breaker was resting, 2 when the guard retried),
 * which is why asks and calls are reported separately.
 *
 * **The cursor advances whether or not the ROLLING ask succeeded — but only if it was ASKED.** A
 * refusal is the provider's verdict on that date: it is reported and counted, and holding the
 * cursor still would let one permanently unanswerable date stall a combo for ever, so the band
 * comes round again on the next sweep, closer to departure. An ask that spent **no call** is not a
 * verdict at all — the breaker was resting, or the adapter refused the route before building a URL
 * — so nothing was covered, the cursor holds, no strike is recorded, and it is reported in its own
 * `notAsked` section. Treating the two alike burned a four-day band of journey dates nobody had
 * asked for and named blameless combos stale; those dates cannot be refilled, because a past date
 * answers 400. See `restedOnTheGate`.
 *
 * **Only the rolling ask can make a combo stale.** `REFUSALS_BEFORE_STALE` counts consecutive
 * refusals to spot a route the provider does not know (12951, measured). A pinned ask may
 * legitimately refuse or come back short because the train simply does not run today, so counting it
 * would name a perfectly good Tuesday-only train a bad list entry. Pinned refusals are reported in
 * their own section instead, and do not make the run un-whole.
 *
 * **And a rolling refusal from a combo that ANSWERED some other ask this run earns no strike at
 * all.** See the invariant at the foot of this function: staleness is a verdict on whether the
 * PROVIDER KNOWS THE ROUTE, and an answer is the proof that it does. Which is why the strikes are
 * held in a local map and settled after the loop rather than as each refusal arrives: a combo's
 * pinned ask comes after its rolling one, so at the moment of the refusal the evidence that would
 * excuse it has not been collected yet.
 *
 * A refused combo never stops the run; one bad entry must not cost the rest of the list. A gate, by
 * contrast, does stop it: slowing down would still spend the plan. **A resting breaker is a gate**,
 * and the third one — it is open for this caller as a whole, so every remaining ask would rest too.
 *
 * @param {{
 *   routes: readonly Route[], cursors: Cursors, today: string, horizonDays: number, windowDays: number,
 *   ask: (request: AskRequest) => Promise<AskResult>,
 *   record: (request: AskRequest, outcome: Answered) => Promise<number>,
 *   ceiling: number, remainingFloor?: number, callsPerAsk?: number
 * }} options
 * @returns {Promise<Summary>}
 */
export async function runCrawl({ routes, cursors, today, horizonDays, windowDays, ask, record, ceiling, remainingFloor = 0, callsPerAsk = CALLS_PER_ASK_MAX }) {
  const plan = planAsks({ routes, cursors, today, horizonDays, windowDays });
  /** @type {Summary} */
  const summary = {
    today,
    horizonDays,
    windowDays,
    listed: routes.length,
    planned: plan.length,
    combos: 0,
    asks: 0,
    calls: 0,
    rows: 0,
    asked: [],
    failures: [],
    pinnedFailures: [],
    notAsked: [],
    forfeited: [],
    shortWindows: [],
    excused: [],
    wrapped: [],
    restarted: [],
    stale: [],
    // Combos this run does not reach keep the place they got to. Losing one would restart that
    // combo's sweep at today and quietly re-read a band it had already covered.
    cursors: { ...cursors },
    stopped: null,
    remaining: null,
    whole: false,
  };

  // Everything a stop leaves unasked, recorded where the stop happens because the breaking step is
  // itself forfeited only when the gate closed BEFORE its ask. The pinned ones are what matter: a
  // pinned ask is the only ask that reaches `days_out = 0`, so one never made is a label that does
  // not exist and that no later run can create. Stopping is still right; it was never free.
  const forfeitFrom = (index) => {
    summary.forfeited = plan.slice(index).map((one) => ({ combo: one.combo, kind: one.kind, date: one.date }));
  };

  /** Combos at least one of whose asks ANSWERED this run, whichever ask it was. The invariant's evidence. */
  const answered = new Set();
  /** Rolling refusals, held rather than struck: a combo's pinned ask comes after it and may excuse it. */
  /** @type {Map<string, { date: string, refusals: number }>} */
  const held = new Map();

  for (const [index, step] of plan.entries()) {
    const key = step.combo;
    const entry = cursors[key];

    // Reserved BEFORE the ask, never checked after it: a post-hoc `calls >= ceiling` overshoots by
    // `callsPerAsk - 1` at every ceiling the arithmetic does not divide.
    if (summary.calls + callsPerAsk > ceiling) {
      summary.stopped = `the run's own ceiling of ${ceiling} calls — stopping rather than slowing, so the plan live checks depend on stays whole`;
      forfeitFrom(index);
      break;
    }

    // Counted on whichever ask OPENS this combo's turn in the plan — the rolling one normally, the
    // pinned one for a combo that makes no rolling ask at all. Counting `kind === "rolling"` alone
    // would report "4 of 6 combos attempted" on a list whose every combo was asked.
    if (step.kind === "rolling" || step.sole !== undefined) summary.combos += 1;

    if (step.kind === "rolling") {
      if (step.reset === "beyond") summary.wrapped.push(key);
      // `behind` and `unreadable` both abandon the band this sweep was partway through, and those
      // journey dates are gone: a past date answers 400. That is a hole, so it is named and it makes
      // the run un-whole — a restarted sweep that reports "the run was whole" is the lie this
      // section exists to stop.
      else if (step.reset === "behind" || step.reset === "unreadable") {
        const cursor = entry?.next ?? "(none)";
        summary.restarted.push({
          combo: key,
          reason: step.reset,
          cursor,
          gaveUp: step.reset === "behind" ? `${cursor} … ${addDays(today, -1)}` : null,
        });
      }
    }

    const request = { trainNo: step.route.trainNo, from: step.route.from, to: step.route.to, journeyDate: step.date, travelClass: step.route.travelClass, quota: step.route.quota };
    const { outcome, calls, remaining } = await ask(request);
    summary.asks += 1;
    summary.calls += calls;

    const seen = remainingVerdict(remaining, remainingFloor);
    if (seen.known) summary.remaining = seen.remaining;

    // NOTHING LEFT THE PROCESS. Not a refusal: a refusal is the provider's verdict on this date,
    // and this is the absence of one. So the cursor holds — the band was not covered and the next
    // sweep does not come back for it — and no strike is recorded, because a combo cannot be judged
    // by a request nobody received. It is neither asked nor failed; it is its own line in the
    // report, and it makes the run un-whole.
    if (!outcome.ok && calls === 0) {
      const rested = restedOnTheGate(outcome);
      summary.notAsked.push({ combo: key, kind: step.kind, date: step.date, code: outcome.code, why: why(outcome), rested });
      // A gate stops the run, exactly as the ceiling and the burst floor do. The breaker is open
      // for this caller as a whole, so every ask left in the plan would rest too: walking them
      // produces no rows, one breaker read each, and a wall of identical lines. Stopping costs
      // nothing now that the cursors hold — the combos not reached keep their places, which is
      // already what `runCrawl` does for combos it never gets to.
      if (rested) {
        summary.stopped = `the provider's breaker is resting, so ${key}'s ask for ${step.date} was never sent — it is open for this caller as a whole, so every remaining ask would rest too`;
        forfeitFrom(index + 1);
        break;
      }
      continue;
    }

    let written = 0;
    if (outcome.ok) {
      answered.add(key);
      written = await record(request, outcome);
      summary.rows += written;
      // The provider answered, so this combo is not a bad list entry whatever the store did.
      if (step.kind === "rolling") summary.cursors[key] = { next: advanceCursor(step.date, windowDays), refusals: 0 };
      // A store that wrote nothing is our fault, not the train's, whichever ask it was.
      if (written === 0) summary.failures.push({ combo: key, date: step.date, code: "NOT_RECORDED", why: "the provider answered but the store wrote no rows" });
      else if (step.kind === "rolling" && written < windowDays) summary.shortWindows.push({ combo: key, date: step.date, days: written });
    } else if (step.kind === "rolling") {
      const refusals = (entry?.refusals ?? 0) + 1;
      summary.cursors[key] = { next: advanceCursor(step.date, windowDays), refusals };
      summary.failures.push({ combo: key, date: step.date, code: outcome.code, why: why(outcome) });
      held.set(key, { date: step.date, refusals });
    } else {
      summary.pinnedFailures.push({ combo: key, date: step.date, code: outcome.code, why: why(outcome) });
    }

    summary.asked.push({ combo: key, kind: step.kind, date: step.date, daysOut: daysBetween(today, step.date), rows: written, ...(step.sole === undefined ? {} : { sole: step.sole }) });

    if (seen.stop) {
      summary.stopped = `the provider's own RateLimit-Remaining fell to ${seen.remaining}, at or below the floor of ${remainingFloor}`;
      forfeitFrom(index + 1);
      break;
    }
  }

  // ---------------------------------------------------------------------------
  // THE INVARIANT: an ask that ANSWERED is proof the provider knows this route.
  // ---------------------------------------------------------------------------
  // Staleness exists to find a route the provider DOES NOT KNOW — 12951, which answered `Unable to
  // process your request` for every class and date tried. A combo that answers at all is not that
  // combo, so a refusal of its rolling ask is no evidence of a bad entry and earns no strike. The
  // count goes back to zero, exactly as an answered rolling ask already sets it — the proof is the
  // same proof, and merely withholding the strike would park a combo one short of stale for ever,
  // to be tipped over by the first day its train happened not to run. Measured 2026-09-23 and
  // 2026-09-24: 12301 HWH-NDLS 2A/TQ answered 2 rows to its pinned ask both days while its rolling
  // ask refused at 4 and 7 days out, and both Tatkal combos reached `refusals: 2` — one run from
  // sending the operator to delete the GN/TQ pair the list exists for.
  //
  // This needs no domain knowledge and rots with nothing: it covers TQ today and any future quota
  // with a narrow booking window, which is why it and not `QUOTAS_OPENING_NEAR_DEPARTURE` is the fix.
  //
  // **The converse is untouched, and it is the load-bearing half.** A combo where EVERYTHING
  // refuses answers nothing, so nothing excuses it and it goes stale on the schedule it always did.
  // An ask that never reached the provider excuses nothing either — that is the absence of a
  // verdict, not an answer. And the exemption is per combo: another combo answering says nothing
  // about this one.
  //
  // One thing it cannot do: a combo making the PINNED ASK ONLY can never go stale, since a pinned
  // refusal has never counted (the train may not run today) and it has no rolling ask to refuse.
  // Find that one by hand, in the report's pinned-failure section.
  for (const [key, one] of held) {
    if (!answered.has(key)) {
      if (one.refusals >= REFUSALS_BEFORE_STALE) summary.stale.push(`${key} (${one.refusals} runs in a row)`);
      continue;
    }
    summary.cursors[key] = { ...summary.cursors[key], refusals: 0 };
    summary.excused.push({ combo: key, date: one.date, refusals: one.refusals });
  }

  // `asks > 0` is part of it: a run that asked nothing did nothing, and "whole" must not be the
  // verdict on an empty list. `notAsked` is part of it for the same reason one ask at a time: a
  // date the provider never saw is a date this run did not cover, whether or not a gate stopped it.
  summary.whole =
    summary.stopped === null &&
    summary.failures.length === 0 &&
    summary.notAsked.length === 0 &&
    summary.restarted.length === 0 &&
    summary.asks > 0 &&
    summary.asks === summary.planned;
  return summary;
}

// The report — `summarise` and `exitCodeFor` — lives in `crawl-report.mjs`, which this file grew
// out of. It imports `REFUSALS_BEFORE_STALE` from here; nothing here imports it back.
