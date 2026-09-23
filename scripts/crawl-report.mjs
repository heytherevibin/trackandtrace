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
//   * **A failed pinned ask.** The pinned ask at today is what supplies the `days_out = 0` outcome
//     row, and it can legitimately refuse — the train may simply not run today. So it is reported
//     apart from the rolling asks, is not counted towards a combo's consecutive-refusal total, and
//     does NOT make the run un-whole. Counting it would name a Tuesday-only train a bad list entry
//     every Wednesday.
//
// No personal data: this is about berths. There is no PNR here, no user, no passenger.

import { REFUSALS_BEFORE_STALE } from "./crawl-plan.mjs";
import { cycleRuns } from "./crawl-window.mjs";

/** @typedef {import("./crawl-plan.mjs").Summary} Summary */

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
    `${pad("asks")} ${summary.asks} of ${summary.planned} planned (the rolling window plus one pinned at ${summary.today} for the outcome row, which are the same ask on the run a sweep wraps; the sweep takes ${sweep} runs at a ${summary.horizonDays}-day horizon)`,
    `${pad("calls made")} ${summary.calls}`,
    `${pad("rows written")} ${summary.rows}`,
    `${pad("RateLimit-Remaining")} ${summary.remaining === null ? "not sent by the provider" : summary.remaining}`,
  ];

  if (summary.asked.length > 0) {
    lines.push("", "What each combo asked for, and where its window is now:");
    for (const one of summary.asked) {
      const tail = one.kind === "rolling" ? ` · next ${summary.cursors[one.combo]?.next ?? "?"}` : " · the outcome row";
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

  if (summary.stopped !== null) lines.push("", `STOPPED: ${summary.stopped}`);

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
      "  The BAND is not lost — the next run asks exactly where each of these stopped. What is lost is today's observation of it, and a day the crawler did not reach is a day the dataset never gets.",
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

  if (summary.pinnedFailures.length > 0) {
    lines.push(
      "",
      `${summary.pinnedFailures.length} pinned ask${s(summary.pinnedFailures.length)} at ${summary.today} did not answer, so ${summary.pinnedFailures.length === 1 ? "that journey date has" : "those journey dates have"} no days_out = 0 outcome row. Usually this means the train does not run today, which is normal — it is NOT counted against the combo's consecutive refusals and does not make the run un-whole. A combo that appears here every day is worth a look:`,
    );
    for (const failure of summary.pinnedFailures) lines.push(`  ${failure.combo}  ${failure.date}  ${failure.why}`);
  }

  if (summary.shortWindows.length > 0) {
    lines.push(
      "",
      `${summary.shortWindows.length} rolling window${s(summary.shortWindows.length)} came back with fewer than ${summary.windowDays} days. Normal at TQ and on a train that does not run daily; a pattern anywhere else is worth a look:`,
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

  lines.push("", summary.whole ? "The run was whole: every combo asked and answered." : "The run was NOT whole. The dataset has holes where the lines above say it does.");
  return lines;
}

/**
 * Non-zero the moment the run was not whole, so an operator reading only the exit code still learns
 * of the hole.
 *
 * @param {Summary} summary
 * @returns {number}
 */
export function exitCodeFor(summary) {
  return summary.whole ? 0 : 1;
}
