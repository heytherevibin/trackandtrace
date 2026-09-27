// What a crawl run says about itself, and the exit code that says it again in one number.
//
// Split out of `crawl-plan.mjs` when that file crossed 500 lines. Pure: a summary in, lines out —
// no clock, no network, no database, nothing printed here. `crawl-availability.mjs` does the
// printing.
//
// ---------------------------------------------------------------------------
// A SILENT PARTIAL RUN IS WHAT QUIETLY RUINS THE DATASET.
// ---------------------------------------------------------------------------
// A missed journey date is permanent: a past date answers `400 Failed to fetch availability`, so
// nothing can go back for it. Addendum §4.1 therefore asks that a partial run be LOUD, and that the
// exit code say whether the run was whole.
//
// **The first half of that still holds; the second was wrong and is corrected.** The report is the
// loud part, and it is louder than ever: every hole below is named with its combo and its date. The
// EXIT CODE is not a second copy of it. A provider refusing one train leaves a hole and is a
// Tuesday, and the first scheduled run — 14 asks, 13 answers, 42 rows — exited 1 for exactly that.
// An alarm that fires on the ordinary case is one an operator learns to stop reading, and then the
// run that really failed goes past unread with the rest. So the exit code answers the narrower
// question, "could this run do its job", and `exitCodeFor` sets out what still trips it.
//
// Everything below follows from that one rule, including the two sections added after review found
// them missing:
//
//   * **A restarted sweep.** A `behind` or `unreadable` cursor abandons the band the sweep was
//     partway through — and those journey dates are gone. It used to be recorded nowhere: a crawler
//     five days out of date printed "The run was whole" and exited 0. It is now named, with the band
//     it gave up, and it makes the run un-whole.
//   * **An ask that never reached the provider.** A resting breaker answers with the same code a
//     real refusal carries and spends no call. Folded in with the refusals it advanced a cursor
//     over a four-day band nobody asked for and struck a blameless combo towards "delete this from
//     routes.json". It has its own section, it names the held cursor, and it makes the run
//     un-whole — but it is emphatically NOT a refusal, and the prose has to say so or an operator
//     will go looking for a bad route that does not exist.
//   * **A failed pinned ask.** The pinned ask at today is what supplies the `days_out = 1` outcome
//     row, and it can legitimately refuse — the train may simply not run today. So it is reported
//     apart from the rolling asks, is not counted towards a combo's consecutive-refusal total, and
//     does NOT make the run un-whole. Counting it would name a Tuesday-only train a bad list entry
//     every Wednesday.
//   * **A rolling refusal that earned no strike.** If a combo's pinned ask ANSWERED, the provider
//     demonstrably knows that route, so its rolling refusal is not evidence of a bad list entry and
//     `runCrawl` clears the count. A counter that silently does not move is exactly the sort of
//     thing an operator later calls a bug, so the run names every refusal it excused and why.
//   * **A rolling refusal nothing in the run could weigh.** A provider outage refuses in the same
//     words a route the provider has never heard of does, and spends a call doing it — so a run in
//     which nothing at all answered cannot tell them apart and strikes nobody. It has to say that
//     out loud: an operator seeing a wall of refusals and no verdict otherwise assumes the verdicts
//     are still coming, and four days of somebody else's outage would otherwise have told them to
//     delete every GN combo on the shipped list.
//   * **A rolling refusal the run had no standing to settle.** When a gate stops the run before the
//     same combo's other ask, the evidence that would have excused it was forfeited, so the count
//     moves NEITHER way and the next complete run decides. An operator reading a stopped run must
//     not have to work out for themselves which verdicts it was entitled to reach, so it says which
//     refusals it held, what the count stayed at, and that the cursor moved on regardless.
//   * **A combo that has produced no rows for runs on end.** The stale list answers a narrow
//     question and its answer is "delete this"; this one answers "is this entry contributing
//     anything at all?" and its answer is only "go and look". They are printed apart and never
//     merged, because an operator who reads the second as the first deletes a good route.
//
// One more thing the prose has to carry: a combo may make ONE ask rather than two, when its quota
// only opens near departure and a rolling ask could never answer. That shows up beside the ask
// itself, in the line that says what the combo asked for, because that is where a reader meets it.
//
// No personal data: this is about berths. There is no PNR here, no user, no passenger.

import { REFUSALS_BEFORE_STALE, RUNS_WITHOUT_ROWS_BEFORE_NOTICE, affordablePrefix, plannedCalls } from "./crawl-plan.mjs";
import { cycleRuns } from "./crawl-window.mjs";

/** @typedef {import("./crawl-plan.mjs").Summary} Summary */
/** @typedef {import("./crawl-plan.mjs").Route} Route */
/** What gate C knows about today. `limitedByDay` says which of the two ceilings is binding. */
/** @typedef {{ dailyCap: number, spentToday: number, remainingToday: number, limitedByDay: boolean }} DayBudget */

const pad = (label) => label.padEnd(18);
const s = (n) => (n === 1 ? "" : "s");

/**
 * @param {Summary} summary
 * @returns {string[]}
 */
export function summarise(summary) {
  const sweep = cycleRuns(summary.horizonDays, summary.windowDays);
  const lines = [
    "",
    `${pad("combos attempted")} ${summary.combos} of ${summary.listed}`,
    `${pad("asks")} ${summary.asks} of ${summary.planned} planned (the rolling window plus one pinned at ${summary.today} for the outcome row — one ask only where a sweep wraps onto today, or where the quota opens too close to departure for a rolling ask to answer; the sweep takes ${sweep} runs at a ${summary.horizonDays}-day horizon)`,
    `${pad("calls made")} ${summary.calls}`,
    `${pad("rows written")} ${summary.rows}`,
    `${pad("RateLimit-Remaining")} ${summary.remaining === null ? "not sent by the provider" : summary.remaining}`,
  ];

  if (summary.asked.length > 0) {
    lines.push("", "What each combo asked for, and where its window is now:");
    for (const one of summary.asked) {
      // A combo with one ask where its neighbours have two is the kind of thing a reader silently
      // files as a bug, so the line that shows the ask is the line that says why.
      const outcome = one.sole === undefined ? " · the outcome row" : ` · the outcome row, and this combo's ONLY ask: ${one.sole}`;
      const tail = one.kind === "rolling" ? ` · next ${summary.cursors[one.combo]?.next ?? "?"}` : outcome;
      lines.push(`  ${one.combo}  ${one.kind.padEnd(7)} ${one.date} (${one.daysOut} days out) · ${one.rows} row${s(one.rows)}${tail}`);
    }
  }

  if (summary.wrapped.length > 0) {
    lines.push("", `Wrapped back to ${summary.today} — a sweep finished and the next one starts closer to departure:`);
    for (const combo of summary.wrapped) lines.push(`  ${combo}`);
  }

  if (summary.restarted.length > 0) {
    lines.push(
      "",
      `${summary.restarted.length} sweep${s(summary.restarted.length)} RESTARTED at ${summary.today}, abandoning the band it was partway through. Those journey dates are gone — a past date answers 400 and the rolling window does not go back for them:`,
    );
    for (const one of summary.restarted) {
      const because = one.reason === "behind" ? "the crawler has not run since then" : "the cursor could not be read";
      lines.push(`  ${one.combo}  cursor ${one.cursor} (${because}) · gave up ${one.gaveUp ?? "a band it cannot name"}`);
    }
    lines.push("  Run daily, or accept the hole: this is the one failure nothing can repair afterwards.");
  }

  if (summary.stopped !== null) {
    lines.push("", `STOPPED: ${summary.stopped}`);
    // What stopping cost, said out loud. Stopping is the right call — the fuse is 30 s at minimum
    // and every remaining ask would rest too — but "it costs nothing" was never true. A pinned ask
    // is the only ask that reaches `days_out = 1`, so one the run never made is a label that does
    // not exist and that no later run can create: the rolling window reaches 0 for one journey date
    // in twenty.
    // Keyed on the DATE, not on `kind`. On the run a sweep wraps, `planAsks` emits one step instead
    // of two because the rolling date already IS today — and that merged step is marked `rolling`
    // while carrying the outcome. Counting `kind === "pinned"` would quietly miss exactly the combos
    // that had just wrapped.
    const lostOutcomes = summary.forfeited.filter((one) => one.date === summary.today);
    if (lostOutcomes.length > 0) {
      lines.push(
        `  ${lostOutcomes.length} combo${s(lostOutcomes.length)} past the stop were never asked for today's outcome row, and THAT is gone for good — a days_out = 1 row is the label, and only the pinned ask reaches it:`,
      );
      for (const one of lostOutcomes) lines.push(`    ${one.combo}  ${one.date}`);
    }
    const lostBands = summary.forfeited.filter((one) => one.date !== summary.today);
    if (lostBands.length > 0) {
      lines.push(`  ${lostBands.length} rolling ask${s(lostBands.length)} past the stop were not made either; those cursors held, so the next run asks the same band.`);
    }
  }

  if (summary.notAsked.length > 0) {
    lines.push(
      "",
      `${summary.notAsked.length} ask${s(summary.notAsked.length)} NEVER REACHED THE PROVIDER — nothing was sent, so this is NOT a refusal: the provider passed no verdict on the dates below. Each cursor held where it was and took no refusal strike, because the band was not covered and the next sweep does not come back for it:`,
    );
    for (const one of summary.notAsked) {
      const because = one.rested
        ? "the breaker was resting, so the guard sent nothing"
        : "the adapter refused this route before building a URL — that IS a bad list entry, and it got past the preflight";
      lines.push(`  ${one.combo}  ${one.kind.padEnd(7)} ${one.date}  ${because}`);
    }
    lines.push(
      "  Each cursor above still points where it did, so the next run asks that same band. What is lost is today's observation of it, and a day the crawler did not reach is a day the dataset never gets.",
      "  (A combo whose cursor was already BEHIND is the exception: it is listed under RESTARTED above, and the next run will again find it behind and again ask today.)",
    );
    if (summary.notAsked.some((one) => one.rested)) lines.push("  Nothing was spent on these. Run again once the provider has recovered.");
    if (summary.notAsked.some((one) => !one.rested)) lines.push("  A route the adapter will not build a URL for will do this every run: fix or remove that entry in routes.json.");
  }

  if (summary.failures.length > 0) {
    lines.push(
      "",
      `${summary.failures.length} ask${s(summary.failures.length)} did not become rows. The band comes round again next sweep, closer in — but nearer departure there are fewer sweeps left to catch it.`,
    );
    for (const failure of summary.failures) lines.push(`  ${failure.combo}  ${failure.date}  ${failure.why}`);
  }

  if (summary.excused.length > 0) {
    lines.push(
      "",
      `${summary.excused.length} rolling refusal${s(summary.excused.length)} above took NO staleness strike, because the same combo's pinned ask answered this run. The provider demonstrably knows the route, so the refusal is not evidence of a bad list entry — each count below is back to zero rather than one run nearer "delete this from routes.json":`,
    );
    for (const one of summary.excused) lines.push(`  ${one.combo}  ${one.date}  would have been strike ${one.refusals} of ${REFUSALS_BEFORE_STALE}`);
  }

  if (summary.withheld.length > 0) {
    lines.push(
      "",
      `${summary.withheld.length} rolling refusal${s(summary.withheld.length)} ${summary.withheld.length === 1 ? "was" : "were"} HELD rather than settled, because the run never got to put ${summary.withheld.length === 1 ? "the same combo's other ask" : "those combos' other asks"} to the provider. A strike says "the provider does not know this route" and this run has no standing to say it — so the count did NOT move either way, and the next COMPLETE run decides. The cursor DID move on, because the refusal is the provider's verdict on the date it asked for:`,
    );
    for (const one of summary.withheld) {
      lines.push(`  ${one.combo}  ${one.date}  would have been strike ${one.wouldHaveBeen} of ${REFUSALS_BEFORE_STALE} · count held at ${one.refusals} · next ${summary.cursors[one.combo]?.next ?? "?"} · ${one.because}`);
    }
    lines.push("  Nothing above is a bad list entry and nothing above is cleared: this run simply does not know. Run again once the provider has recovered.");
  }

  if (summary.blind.length > 0) {
    lines.push(
      "",
      `${summary.blind.length} rolling refusal${s(summary.blind.length)} took NO staleness strike, because NOTHING IN THIS RUN ANSWERED. A strike says "the provider does not know this route" — and a route the provider has never heard of and a provider that is down refuse in the SAME words, so the only thing that tells them apart is whether something else answered. Nothing did. The count therefore did NOT move either way; it stands where the last run that learnt anything left it, and the next run in which anything answers decides:`,
    );
    for (const one of summary.blind) {
      lines.push(`  ${one.combo}  ${one.date}  would have been strike ${one.wouldHaveBeen} of ${REFUSALS_BEFORE_STALE} · count held at ${one.refusals} · next ${summary.cursors[one.combo]?.next ?? "?"}`);
    }
    lines.push(
      "  Nothing above is a bad list entry and nothing above is cleared. Check the PROVIDER before you check the list: a whole run of refusals and no verdict is what an outage looks like from in here.",
      "  The cursors did move on — the provider refused the dates it was asked for — and the produced-no-rows count below still climbs, because a day nothing answered is a real hole in the dataset whoever caused it.",
    );
  }

  if (summary.pinnedFailures.length > 0) {
    lines.push(
      "",
      `${summary.pinnedFailures.length} pinned ask${s(summary.pinnedFailures.length)} at ${summary.today} did not answer, so ${summary.pinnedFailures.length === 1 ? "that journey date has" : "those journey dates have"} no days_out = 1 outcome row. Usually this means the train does not run today, which is normal — it is NOT counted against the combo's consecutive refusals and does not make the run un-whole. A combo that appears here every day is worth a look:`,
    );
    for (const failure of summary.pinnedFailures) lines.push(`  ${failure.combo}  ${failure.date}  ${failure.why}`);
  }

  if (summary.shortWindows.length > 0) {
    lines.push(
      "",
      `${summary.shortWindows.length} rolling window${s(summary.shortWindows.length)} came back with fewer than ${summary.windowDays} days. Normal on a train that does not run daily, or on a quota that is not open for the whole band; a pattern anywhere else is worth a look:`,
    );
    for (const short of summary.shortWindows) lines.push(`  ${short.combo}  ${short.date}  ${short.days} day${s(short.days)}`);
  }

  if (summary.stale.length > 0) {
    lines.push(
      "",
      `Refused ${REFUSALS_BEFORE_STALE} or more runs in a row — a bad list entry, not a transient failure. Delete it from routes.json rather than retrying it daily:`,
    );
    for (const combo of summary.stale) lines.push(`  ${combo}`);
  }

  if (summary.withoutRows.length > 0) {
    lines.push(
      "",
      `${summary.withoutRows.length} combo${s(summary.withoutRows.length)} ${summary.withoutRows.length === 1 ? "has" : "have"} produced NO ROWS for ${RUNS_WITHOUT_ROWS_BEFORE_NOTICE} runs or more in a row. GO AND LOOK — this is NOT the stale list above and it does NOT say to delete anything. It says only that these entries are contributing nothing to the dataset, whatever their sampler is and whatever the reason:`,
    );
    for (const one of summary.withoutRows) lines.push(`  ${one.combo}  ${one.runs} runs`);
    lines.push(
      `  A train that runs one day a week still has that day inside any ${RUNS_WITHOUT_ROWS_BEFORE_NOTICE} runs, so this is past what a thin timetable explains. Likely causes, in order: a pinned-only (Tatkal) entry the provider will not answer for, a rolling ask that has died while the pinned one carries the combo, or a store that is writing nothing.`,
      "  It does not change the exit code: that number is about whether this run could DO ITS JOB, and a combo the provider will not answer for is an answer. Confirm against the sections above, then fix or remove the entry deliberately.",
    );
  }

  // Two verdicts, deliberately, because they answer different questions and an operator who reads
  // only one of them should not be misled by it. WHOLE is about the dataset. The EXIT CODE is about
  // the run. A provider refusing one train leaves a hole and is not a failure of this run, so the
  // common case now prints both — "not whole" and "exits 0" — and says why in the same breath,
  // rather than leaving a reader to wonder which of the two lines to believe.
  if (summary.whole) lines.push("", "The run was whole: every combo asked and answered.");
  else if (ranItsPlan(summary)) {
    lines.push(
      "",
      "The run was NOT whole. The dataset has holes where the lines above say it does.",
      "It still exits 0: every ask it planned was made and rows were written, so the run did what it came to do and the provider answered no to part of it. The holes are named above, which is where a hole can say which combo and which date; an exit code cannot.",
    );
  } else {
    lines.push(
      "",
      "The run was NOT whole, and it exits non-zero: it did not do what it came to do. Either a gate stopped it, an ask was never sent, a sweep lost its place, or nothing answered at all — see the sections above for which.",
    );
  }
  return lines;
}

/**
 * **Was this run able to do its job.** That is the only question this answers, and it is not the
 * same question as whether the dataset is whole.
 *
 * It used to be `summary.whole ? 0 : 1`, which made a PROVIDER REFUSAL set the exit code. The first
 * scheduled run, on 2026-09-27, asked 14, answered 13 and wrote 42 rows — and exited 1, because one
 * rolling ask came back SOURCE_UNAVAILABLE. A provider refusing one train out of twelve is a
 * Tuesday. Red every Tuesday is how an operator learns to stop reading the red, and then the run
 * that really failed goes by unread with all the others.
 *
 * Wholeness has not gone anywhere: it is still computed, still printed, and still names every hole
 * in the sections above. A hole belongs in the report, which says WHICH combo and WHICH date. An
 * exit code cannot say that, and a daily alarm that carries no detail buys nothing.
 *
 * Four things still set it, because each is this run failing rather than the provider answering no:
 *
 *   * a GATE stopped it — the run's ceiling, the day's budget, a resting breaker. Asks that would
 *     have been made were not.
 *   * an ask was never SENT (`notAsked`), for the same reason.
 *   * a sweep RESTARTED — OUR cursor lost its place, and the journey dates it skipped are gone for
 *     good, because a past date answers 400. Nobody else caused that one.
 *   * NOTHING answered. Each refusal alone is a Tuesday; all of them at once is the provider being
 *     down, and this file already says so in as many words: "a whole run of refusals and no verdict
 *     is what an outage looks like from in here."
 *
 * The store's own health is a different instrument again, cumulative rather than per-run, and it has
 * its own exit code: `npm run source:report`.
 *
 * @param {Summary} summary
 * @returns {number}
 */
export function exitCodeFor(summary) {
  return ranItsPlan(summary) ? 0 : 1;
}

/**
 * The predicate behind the exit code, named because the REPORT says the same thing in prose and two
 * copies of one rule are two rules waiting to disagree — which this store's own migration says in
 * as many words: "a value two callers compute is a value that will disagree".
 *
 * @param {Summary} summary
 * @returns {boolean}
 */
export function ranItsPlan(summary) {
  const askedItsPlan = summary.stopped === null && summary.notAsked.length === 0 && summary.asks > 0 && summary.asks === summary.planned;
  const keptItsPlace = summary.restarted.length === 0;
  // Rows, not answers: a run that was told something and stored none of it has no more to show for
  // itself than one that was told nothing.
  const heardSomething = summary.rows > 0;
  return askedItsPlan && keptItsPlace && heardSomething;
}

// ---------------------------------------------------------------------------
// Gate C, in the two places an operator meets it: the banner, and the refusal.
// ---------------------------------------------------------------------------

/**
 * What the day has already cost and what is left of it — the number an operator most needs now that
 * a second run can refuse, and the reason `--dry-run` prints these lines before returning.
 *
 * The day is IST, bucketed by the same SQL expression `availability_observations.observed_on` uses,
 * so this line and the store's own coverage can be read side by side without converting anything.
 *
 * @param {{ today: string, dailyCap: number, spentToday: number, remainingToday: number, reason: string }} day
 * @returns {string[]}
 */
export function dayBudgetLines({ today, dailyCap, spentToday, remainingToday, reason }) {
  // Padded to the pre-run banner's own 15, not `summarise`'s 18: these lines sit among the banner's.
  const label = (text) => text.padEnd(15);
  return [
    `${label("spent today")}${spentToday} of ${dailyCap} call${s(dailyCap)} charged to ${today} (IST), ${remainingToday} left — the crawler's own counter, beside the observations`,
    `${label("day ceiling")}${reason}`,
  ];
}

/**
 * Why a run refused before asking anything, and what an operator can do about it.
 *
 * **The `--only` arithmetic is the point of this function.** Once a day is partly spent a whole run
 * no longer fits, which is correct for a crawler meant to run once a day — and is also a wall in
 * front of a legitimate retry after a run a gate cut short. Without a named, costed alternative the
 * only flag left is `--reserve`, which widens the gate by leaving live PNR checks unprotected. So
 * the refusal says which shorter run still fits, and what it costs.
 *
 * It also says what `--only` actually does, because the obvious reading is wrong: it takes the
 * FIRST n entries of the route file, in file order. It cannot retry the combos an interrupted run
 * missed, and an operator who assumes it can will believe a hole has been filled that has not.
 *
 * @param {{ worstCase: number, ceiling: number, routes: readonly Route[], day: DayBudget | null }} at
 * @returns {string}
 */
export function overBudgetRefusal({ worstCase, ceiling, routes, day }) {
  const byDay = day !== null && day.limitedByDay;
  const fits = affordablePrefix({ routes, ceiling });
  const head = byDay
    ? `this run's worst case (${worstCase} calls) is over what is left of today's budget (${ceiling} call${s(ceiling)}). Nothing was asked.\n` +
      `Today has already cost ${day.spentToday} of its ${day.dailyCap} calls, leaving ${day.remainingToday}. That is the daily gate working, not a fault: this crawler is meant to run once a day, and one full run costs up to ${worstCase}.`
    : `this run's worst case (${worstCase} calls) is over its ceiling (${ceiling}). Nothing was asked.`;
  const door =
    fits === 0
      ? `Not even \`--only 1\` fits: the first combo alone costs up to ${plannedCalls({ routes: routes.slice(0, 1) })} calls and ${ceiling} ${ceiling === 1 ? "is" : "are"} left.`
      : `A shorter list fits: \`--only ${fits}\` asks the first ${fits} of the ${routes.length} combos and costs at most ${plannedCalls({ routes: routes.slice(0, fits) })} calls.\n` +
        "Read that flag literally — it takes the FIRST n entries of the route file, in file order. It cannot pick which combos to retry, so a run cut short in the middle of the list is not repaired by it.";
  const reserve = "Or state a wider share of the plan with --reserve — and say out loud how many live PNR checks that leaves unprotected.";
  return `${head}\n\n${door}\n${reserve}`;
}
