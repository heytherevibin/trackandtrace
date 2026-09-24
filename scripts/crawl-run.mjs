// The availability crawler's run: the loop that walks the plan, spends the calls and records what
// happened. Split out of `crawl-plan.mjs` when that file passed 500 lines for the third time -- the
// plan (the constants, the two gates, `planAsks`) stays there, the report stays in
// `crawl-report.mjs`, and this is only the walking.
//
// Pure apart from its injected `ask` and `record`, so every case is tested without a network or a
// database. Read `crawl-plan.mjs`'s header before changing anything about what a run may spend.
//
// No personal data: this is about berths. There is no PNR here, no user, no passenger.

import { CALLS_PER_ASK_MAX, REFUSALS_BEFORE_STALE, planAsks, remainingVerdict } from "./crawl-plan.mjs";

import { addDays, advanceCursor, daysBetween } from "./crawl-window.mjs";

/** @typedef {import("./crawl-plan.mjs").Route} Route */
/** @typedef {import("./crawl-plan.mjs").AskRequest} AskRequest */
/** @typedef {import("./crawl-plan.mjs").AskResult} AskResult */
/** @typedef {import("./crawl-plan.mjs").Answered} Answered */
/** @typedef {import("./crawl-plan.mjs").Refused} Refused */
/** @typedef {import("./crawl-plan.mjs").Cursors} Cursors */
/** @typedef {import("./crawl-plan.mjs").Summary} Summary */

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

