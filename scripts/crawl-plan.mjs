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
import { cycleRuns, nextAsk } from "./crawl-window.mjs";

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
/**
 * How many runs in a row a combo may produce NO ROWS AT ALL before the report says to go and look.
 *
 * **A different question from staleness, and deliberately a weaker verdict.** `REFUSALS_BEFORE_STALE`
 * answers "has the provider ever heard of this route?" and its answer is *delete the entry*. This
 * one answers "is this combo contributing anything to the dataset?", and its answer is only *go and
 * look*. The two lists never merge: nothing is ever deleted on the strength of this count.
 *
 * It exists because the stale list cannot see a whole class of dead combo. A combo that makes the
 * PINNED ASK ONLY (`QUOTAS_OPENING_NEAR_DEPARTURE`) has no rolling ask to refuse, and a pinned
 * refusal has never counted; a combo whose rolling ask is permanently dead while its pinned ask
 * answers is excused every run by the invariant in `crawl-run.mjs`. Neither shows up anywhere. Nor
 * does the coverage report catch them promptly: its exit code is an aggregate over every listed
 * combo, so one dead combo out of six takes about 13 days to cross the threshold on a 30-day history
 * and about 39 on a 90-day one — and a combo that has NEVER answered has no first observation at
 * all, so it sits in `neverObserved`, outside the denominator, at 100% for ever.
 *
 * This count needs to know none of that. It asks the only question that covers every sampler: did
 * any ask of this combo produce a row this run?
 *
 * **Seven, because seven runs is a week and a week is the longest silence a train on this list can
 * honestly have.** A combo is asked once per run, so a train that runs a single day a week still has
 * that day inside any seven-run stretch: six consecutive empty runs is the worst a legitimate weekly
 * service can do, and the seventh means it missed even its own running day. It counts RUNS and not
 * days, so a skipped day does not inflate it. Comfortably above `REFUSALS_BEFORE_STALE`, so the
 * weaker verdict also takes longer to reach; comfortably inside the twenty runs a sweep takes, so a
 * dead rolling sampler is named long before its next wrap; and unlike the coverage report it does
 * not get slower as the dataset gets older.
 */
export const RUNS_WITHOUT_ROWS_BEFORE_NOTICE = 7;

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
/**
 * A rolling refusal this run was not entitled to settle EITHER WAY, because a gate cost the combo
 * one of its other asks. `wouldHaveBeen` is the strike it did not take; `refusals` is the stored
 * count, left exactly where the last complete run put it.
 */
/** @typedef {{ combo: string, date: string, wouldHaveBeen: number, refusals: number, because: string }} Withheld */
/**
 * A rolling refusal held because NOTHING IN THE RUN ANSWERED. A dead route and a dead provider
 * arrive in the same words, so a run that heard nothing cannot tell them apart. Same fields as
 * `Withheld` less `because`: every entry has the same reason, and the section says it once.
 */
/** @typedef {{ combo: string, date: string, wouldHaveBeen: number, refusals: number }} Blind */
/** A combo that has produced no rows for `RUNS_WITHOUT_ROWS_BEFORE_NOTICE` runs or more. NOT the stale list. */
/** @typedef {{ combo: string, runs: number }} WithoutRows */
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
 *   shortWindows: ShortWindow[], excused: Excused[], withheld: Withheld[], blind: Blind[], withoutRows: WithoutRows[],
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
