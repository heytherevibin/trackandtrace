// The availability crawler's run: the loop that walks the plan, spends the calls and records what
// happened. Split out of `crawl-plan.mjs` when that file passed 500 lines for the third time -- the
// plan (the constants, the two gates, `planAsks`) stays there, the report stays in
// `crawl-report.mjs`, and this is only the walking.
//
// Pure apart from its injected `ask` and `record`, so every case is tested without a network or a
// database. Read `crawl-plan.mjs`'s header before changing anything about what a run may spend.
//
// No personal data: this is about berths. There is no PNR here, no user, no passenger.

import { CALLS_PER_ASK_MAX, REFUSALS_BEFORE_STALE, RUNS_WITHOUT_ROWS_BEFORE_NOTICE, planAsks, remainingVerdict } from "./crawl-plan.mjs";
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
 * Of the asks that spent no call, which ones still say something about the ROUTE.
 *
 * **This is a different question from `restedOnTheGate`, and it must fail the other way.** That one
 * decides whether to stop the run, and falls through to "keep going" — a wasted walk, no data lost.
 * This one decides whether a refusal may be settled into a staleness strike, and the runbook tells
 * an operator to DELETE a route a strike names. So it must fall through to "hold".
 *
 * Only `INVALID` is evidence: the adapter would not build a URL for this route at all, which is a
 * fact about the entry and not about the provider's mood. Every other zero-call outcome means the
 * request was never sent, whatever its shape, so the combo cannot be judged by it — including a
 * shape nothing in this codebase produces today. Sharing one predicate between the two decisions
 * made this one inherit the unsafe direction, and a novel zero-call refusal settled a strike on an
 * ask nobody made.
 *
 * @param {Refused} outcome
 * @returns {boolean}
 */
function routeIsAtFault(outcome) {
  return outcome.code === "INVALID";
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
 * **And NO combo is struck by a run in which nothing answered at all.** An outage refuses in the
 * same words an unknown route does, so a run that heard nothing cannot tell them apart: the count
 * is HELD where the last informative run put it, not cleared.
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
    withheld: [],
    blind: [],
    withoutRows: [],
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

  /** Combos at least one of whose asks ANSWERED this run, whichever ask it was. The invariant's evidence. */
  const answered = new Set();
  /**
   * Combos an ask of which the run was PREVENTED from putting to the provider, and in what words.
   *
   * Not the same thing as a refusal and not the same thing as an answer: it is the question this run
   * did not get to ask, so no verdict that would have turned on it may be settled from here. Two
   * ways in, and both are the run's problem rather than the combo's — a gate stopping the run before
   * the ask came round, and the guard's breaker resting when it did. A zero-call `INVALID` is
   * deliberately NOT one of them: that is the adapter refusing to build a URL for this route, which
   * is evidence about the route itself.
   */
  /** @type {Map<string, string>} */
  const unasked = new Map();

  // Everything a stop leaves unasked, recorded where the stop happens because the breaking step is
  // itself forfeited only when the gate closed BEFORE its ask. The pinned ones are what matter: a
  // pinned ask is the only ask that reaches `days_out = 0`, so one never made is a label that does
  // not exist and that no later run can create. Stopping is still right; it was never free.
  const forfeitFrom = (index) => {
    summary.forfeited = plan.slice(index).map((one) => ({ combo: one.combo, kind: one.kind, date: one.date }));
    for (const one of summary.forfeited) if (!unasked.has(one.combo)) unasked.set(one.combo, `the run stopped before its ${one.kind} ask for ${one.date}`);
  };
  /** Rolling refusals, held rather than struck: a combo's pinned ask comes after it and may excuse it. */
  /** @type {Map<string, { date: string, refusals: number, before: number }>} */
  const held = new Map();
  /** Combos the provider passed a verdict on this run — answered or refused, either way a request was seen. */
  const judged = new Set();
  /** Rows written per combo this run. Anything above zero is proof the combo is still producing data. */
  /** @type {Map<string, number>} */
  const rowsBy = new Map();

  /**
   * Writes a combo's consecutive-runs-without-rows count, keeping everything else its entry holds.
   *
   * **Zero is written by REMOVING the field**, so a healthy list's cursor file is byte-for-byte the
   * shape it has always been and the field appears only where there is something to see.
   *
   * A combo may have no entry at all — a pinned-only one makes no rolling ask, so nothing has ever
   * written it a cursor — and the count still has to live somewhere. Seeding at `today` changes
   * nothing about what is asked: `nextAsk` returns today for a combo with no cursor anyway. It is
   * seeded only when there is a non-zero count to keep, never merely to say "zero".
   */
  const setRunsWithoutRows = (key, runs) => {
    const stored = summary.cursors[key];
    if (runs === 0 && stored === undefined) return;
    const entry = { next: today, refusals: 0, ...stored };
    if (runs === 0) delete entry.runsWithoutRows;
    else entry.runsWithoutRows = runs;
    summary.cursors[key] = entry;
  };

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
      // Nothing was sent, so this combo's other refusals are not ripe to settle — whatever shape
      // this one took. `INVALID` is the single exception, because it IS about the route.
      // Recorded before `forfeitFrom`, which fills in the rest of the plan: this combo's own reason
      // is the specific one, and it is the reason a verdict about THIS combo turns on.
      if (!routeIsAtFault(outcome)) {
        unasked.set(
          key,
          rested
            ? `the breaker was resting when its ${step.kind} ask for ${step.date} came round, so nothing was sent`
            : `its ${step.kind} ask for ${step.date} spent no call, so nothing was sent`,
        );
      }
      if (rested) {
        summary.stopped = `the provider's breaker is resting, so ${key}'s ask for ${step.date} was never sent — it is open for this caller as a whole, so every remaining ask would rest too`;
        forfeitFrom(index + 1);
        break;
      }
      continue;
    }

    // Past the zero-call branch, a request reached the provider and came back with something. That
    // is the only footing from which this run may conclude anything about the combo at all.
    judged.add(key);

    let written = 0;
    if (outcome.ok) {
      answered.add(key);
      written = await record(request, outcome);
      rowsBy.set(key, (rowsBy.get(key) ?? 0) + written);
      summary.rows += written;
      // The provider answered, so this combo is not a bad list entry whatever the store did.
      if (step.kind === "rolling") summary.cursors[key] = { ...summary.cursors[key], next: advanceCursor(step.date, windowDays), refusals: 0 };
      // A store that wrote nothing is our fault, not the train's, whichever ask it was.
      if (written === 0) summary.failures.push({ combo: key, date: step.date, code: "NOT_RECORDED", why: "the provider answered but the store wrote no rows" });
      else if (step.kind === "rolling" && written < windowDays) summary.shortWindows.push({ combo: key, date: step.date, days: written });
    } else if (step.kind === "rolling") {
      // **The strike is keyed on the DATE, not on `kind`.** Where a sweep wraps, `nextAsk` returns
      // today and `planAsks` emits ONE step, marked `rolling`, carrying the outcome row — and a
      // refusal AT TODAY may mean only that the train does not run today, which is the whole reason
      // a pinned refusal has never counted. Marking decides how the ask is reported; the date
      // decides what the refusal is evidence of. `crawl-report.mjs` already had to key its count of
      // forfeited outcome rows on the date for exactly this merge.
      //
      // It costs at most one strike opportunity in a sweep — a combo's rolling ask falls on today
      // once per wrap — and it removes a case where the branch's own rule contradicted itself.
      const before = entry?.refusals ?? 0;
      const refusals = step.date === today ? before : before + 1;
      summary.cursors[key] = { ...summary.cursors[key], next: advanceCursor(step.date, windowDays), refusals };
      summary.failures.push({ combo: key, date: step.date, code: outcome.code, why: why(outcome) });
      if (refusals !== before) held.set(key, { date: step.date, refusals, before });
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
  // The consecutive-runs-without-rows count below is what catches that one.
  //
  // **AND A RUN MAY ONLY SETTLE WHAT IT ACTUALLY ASKED.** `answered` is complete only for a run that
  // reached the end of its plan. A gate landing between a combo's rolling refusal and its pinned ask
  // — the burst floor on the refusal's own header, the ceiling, or the breaker opening on the very
  // next ask — leaves that combo with no answer *because the question was never put*. Settling the
  // strike there writes `refusals: 3` and names a good route on a list the runbook says to DELETE
  // from, on the strength of an ask the run itself threw away; three days of provider trouble
  // tripping the fuse at the same point in the plan is all it takes. So such a refusal is HELD:
  // no strike, no clearing, the stored count exactly where the last complete run left it, and the
  // next complete run decides. The CURSOR still moves — the rolling ask was made and the provider
  // did refuse that date, so the band comes round again next sweep — which is why the held line
  // says so out loud rather than leaving an operator to work out which verdicts a stopped run was
  // entitled to reach.
  /** Nothing anywhere in this run answered, so nothing this run saw is evidence about any route. */
  const nothingAnswered = answered.size === 0;
  for (const [key, one] of held) {
    if (answered.has(key)) {
      summary.cursors[key] = { ...summary.cursors[key], refusals: 0 };
      summary.excused.push({ combo: key, date: one.date, refusals: one.refusals });
      continue;
    }
    // Checked BEFORE the run-wide rule below: a gate naming the very ask this combo lost is more
    // use to an operator than "nothing answered anywhere", and both hold the count identically.
    const prevented = unasked.get(key);
    if (prevented !== undefined) {
      summary.cursors[key] = { ...summary.cursors[key], refusals: one.before };
      summary.withheld.push({ combo: key, date: one.date, wouldHaveBeen: one.refusals, refusals: one.before, because: prevented });
      continue;
    }
    // AND A RUN IN WHICH NOTHING ANSWERED STRIKES NOBODY.
    //
    // A dead route and a dead provider arrive in the same words: 12951 answers `Unable to process
    // your request` for every class and date tried, and IRCTC down answers `Oops! Seems like IRCTC
    // services are down at the moment.` Both are a 400, both map to `SOURCE_UNAVAILABLE(server)`,
    // both spend a call, and the invariant above excuses neither — in an outage nothing answers, so
    // nothing is excused. The only signal that separates them is whether something ELSE answered:
    // if some combos answered and this one did not, that is about the route; if none did, that is
    // about the provider. Measured 2026-09-24 — twelve straight refusals for a combo that had
    // answered normally the day before, and five such days over the shipped list put every GN combo
    // on the stale list on day four.
    //
    // HELD, not cleared, the same choice a forfeited ask already makes: clearing would erase a real
    // strike sequence an outage merely interrupted, which is the other way to lose 12951.
    //
    // **The price, and it is the safe direction: a ONE-COMBO list can no longer go stale at all**,
    // since "nothing answered" and "my only route is dead" are then one observation. A route kept
    // too long costs a call a run; a route deleted wrongly costs the dataset. `runsWithoutRows`
    // below still climbs on it, and the runbook's blind-spot list names this.
    if (nothingAnswered) {
      summary.cursors[key] = { ...summary.cursors[key], refusals: one.before };
      summary.blind.push({ combo: key, date: one.date, wouldHaveBeen: one.refusals, refusals: one.before });
      continue;
    }
    if (one.refusals >= REFUSALS_BEFORE_STALE) summary.stale.push(`${key} (${one.refusals} runs in a row)`);
  }

  // ---------------------------------------------------------------------------
  // IS THIS COMBO PRODUCING ANY DATA? — the question the stale list cannot ask.
  // ---------------------------------------------------------------------------
  // Staleness is narrow on purpose: it means "the provider has never heard of this route, so delete
  // the entry". Three shapes of dead combo slip past it, and all three are alive and useless. A
  // PINNED-ONLY combo has no rolling ask to refuse and a pinned refusal has never counted. A combo
  // whose rolling ask is permanently dead while its pinned ask answers is excused every run by the
  // invariant above — correctly, and it has quietly become a pinned-only sampler, contributing
  // nothing to the long-range band the sweep exists to collect. And a combo the provider answers
  // while the store writes nothing is nobody's bad list entry.
  //
  // So count the one thing that is true of every one of them and needs no domain knowledge and no
  // theory about why: THIS COMBO PRODUCED NO ROWS. It is sampler-agnostic — pinned-only,
  // rolling-only, both, or any future shape — and it is the measure `source:report` cannot supply,
  // because a combo that has NEVER produced a row has no first observation and so sits outside that
  // report's denominator at 100% for ever.
  //
  // **The same rule as everywhere else on this file: only a run that asked may count.** A combo
  // whose ask never reached the provider, or one of whose asks a gate forfeited, is held exactly as
  // its strike is held — the run does not know what the ask it never made would have produced.
  // Rows clear it regardless, because rows are positive evidence and need no completeness.
  //
  // **A run in which NOTHING ANSWERED is deliberately NOT held here.** The strike is a verdict on
  // the ROUTE, and an outage is no evidence about a route. This is a verdict on the DATASET — "this
  // combo produced no rows" — which is simply TRUE in an outage, whoever caused it. Its answer is
  // only *go and look*, never *delete*, so being right about it costs nothing; and on a one-combo
  // list, where the rule above gives the stale signal up entirely, it is the only instrument left.
  for (const key of judged) {
    if ((rowsBy.get(key) ?? 0) > 0) setRunsWithoutRows(key, 0);
    else if (!unasked.has(key)) setRunsWithoutRows(key, (cursors[key]?.runsWithoutRows ?? 0) + 1);
  }
  // Reported over this run's own list, in the list's order, so `--only` does not print verdicts
  // about combos the operator did not ask about. It is NOT the stale list, it does not merge with
  // it, and it never says delete: see `RUNS_WITHOUT_ROWS_BEFORE_NOTICE`.
  for (const key of new Set(plan.map((one) => one.combo))) {
    const runs = summary.cursors[key]?.runsWithoutRows ?? 0;
    if (runs >= RUNS_WITHOUT_ROWS_BEFORE_NOTICE) summary.withoutRows.push({ combo: key, runs });
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

// The report — `summarise` and `exitCodeFor` — lives in `crawl-report.mjs`. Both that file and this
// one grew out of `crawl-plan.mjs`, and both take their thresholds from it rather than from each
// other: `crawl-report.mjs` imports `REFUSALS_BEFORE_STALE` and `RUNS_WITHOUT_ROWS_BEFORE_NOTICE`
// from `crawl-plan.mjs`, not from here, and nothing imports this file but the runner and the tests.
// (This paragraph moved here verbatim in the split and said the opposite of all of that until
// 2026-09-24.)

