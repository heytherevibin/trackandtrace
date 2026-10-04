// What is stuck in the announcement store: the rules for it, and what is printed about it. Pure —
// letters and rows in, verdict out, no clock and no database; the caller says what the time is and
// hands over what it read.
//
// `announce-report.mjs` is the runner that wires this to the real store and is the only file that
// touches the world, exactly as `observations-report.mjs` stands to `observations-coverage.mjs`.
// A rule that can only be tested against a live store is a rule nobody will ever change safely.
//
// ---------------------------------------------------------------------------
// WHAT COUNTS AS STUCK. Read this before changing any rule below.
// ---------------------------------------------------------------------------
// The send job runs once a day and sends what the day's allowance covers. A send that has silently
// stopped working looks like nothing at all from the outside: no error, no mail, a letter that
// simply never finishes. So the report looks for three things, each of which a healthy store never
// shows, and each is reported SEPARATELY. A letter can be advancing and still carry a stale claim,
// so `stuck` returns one entry per REASON, never one per letter, and never lets one reason win.
//
//   1. NO DELIVERY IN 48 HOURS. A letter whose last delivery was more than 48 hours ago and that
//      still has work it is not doing. The job runs daily, so two runs without progress mean it is
//      not running, or every send is failing; either way a person should look. Strictly more than
//      48 hours: a run that is a few minutes late must not raise it. Two shapes, one clock:
//        * ROWS STILL PENDING: "no delivery in 48 hours, N still pending".
//        * NO WORK LEFT, AND NOT MARKED DONE: nothing pending and nothing in flight, yet the letter
//          is still open. It finished its work and should have been marked `done`; if it was not, it
//          is stuck, and a clean bill of health would be false. This is not exotic: `drain` stops
//          on a spent allowance BEFORE it re-reads what remains, so the normal end of a day's run
//          leaves exactly this, and the next run finishes it. Past 48 hours the next run has had
//          its turn and has not. With one letter open there is no neighbour to raise the alarm.
//          (A letter with deliveries still IN FLIGHT is the claim rule's, below, not this one's.)
//        * A letter that has NEVER SENT has `lastSentAt` null (or absent, from a store that does
//          not answer the field at all, and absent is read exactly as null). Null is "has never sent", NEVER the
//          epoch: as the epoch every freshly queued letter would be 56 years stale and the report
//          would cry wolf on its first run. What a never-sent letter is measured from is the time
//          it was queued, so it is named once it has sat 48 hours and has still not sent one. That
//          is the case this report most needs to catch (queued, and the job never ran, or never once
//          succeeded), and reading null as "nothing to measure" would leave it silent for ever. With
//          neither time known there is nothing to measure from and nothing is said.
//        * A time that cannot be parsed is not recent progress: it is named, never excused.
//   2. A DELIVERY CLAIMED OVER 24 HOURS AGO AND NEVER MARKED. A row still `sending` past the
//      provider's idempotency window. The runner marks such a row unknown rather than retry it, so
//      one that is still `sending` means the runner is not reaching it. This is `staleClaims` in
//      announce-plan.mjs and agrees with it on purpose, because two components that disagree about
//      what "in flight too long" means is how one of them becomes wrong with nothing failing:
//        * measured from the FIRST attempt, never the latest claim. A re-claim renews `claimedAt`
//          but not the provider's memory of the key, so `claimedAt` is a clock that restarts daily,
//          and a row re-claimed each day would never look old: blind exactly where a duplicate send
//          hides. There is NO fallback to `claimedAt`.
//        * a first attempt that is absent, null or unreadable counts as STUCK, the side that never
//          sends twice.
//        * the boundary is INCLUSIVE: exactly 24 hours is named. The claim stops re-claiming there,
//          so a row exactly that old is neither retryable nor unknown, and a strictly daily
//          schedule lands exactly on it.
//   3. ANY UNKNOWN AT ALL. A delivery whose outcome we cannot state, whatever its age: it was
//      neither confirmed sent nor confirmed not sent, and it is never normal.
//
// Only letters that are `queued` or `sending` are looked at. A `stopped` letter is excluded from
// every rule: a Stop mid-batch leaves rows already claimed on a letter the runner will never open
// again, and a stopped letter that stopped sending long ago is stopped, not stuck. Without the
// exclusion every stopped letter would be flagged for ever, and a report that always has an entry
// is a report nobody reads. A `done` letter is never flagged, whatever its history.
//
// What this reading CANNOT see, said plainly because a report that hides its blind spots is worse
// than none:
//
//   * WHETHER AN UNKNOWN WAS ACTUALLY SENT. Rule 3 names them because that is the one thing nobody
//     can say. `openClaims` returns the deliveries that are not settled — `sending` and `unknown`
//     alike, each carrying its own state — so the rule is fed; what it can never report is which
//     way the delivery went.
//   * a letter that is not `queued` or `sending`: the runner reads open letters only. A stopped or
//     finished letter's deliveries are not counted, which is the point, and also the limit.
//   * why a letter is stuck. "No delivery in 48 hours" is the same line whether the job is not
//     running, the allowance is spent every day by something else, or every send is refused. The
//     run's own log says which; this cannot.
//   * a letter that is advancing too slowly. 100 a day against a long list is slow by design and is
//     not stuck; this does not estimate how long a letter will take.
//   * an address, a body, a signature, a secret. None is read into the report and none is printed:
//     a line is a letter's id and a reason. The runner is handed rows that may carry more, and
//     `summarise` takes only what a verdict needs.

/** More than this since the last delivery, with rows pending, is stuck. Two runs of a daily job. */
export const NO_PROGRESS_HOURS = 48;
/** More than this since the first attempt, still `sending`, is past the provider's idempotency window. */
export const CLAIM_WINDOW_HOURS = 24;

const HOUR_MS = 3_600_000;

/**
 * @typedef {{ id: string, state: string, pending: number, sending?: number, lastSentAt?: string | null, queuedAt?: string }} OpenLetter
 * @typedef {{ letterId: string, personId?: string, state: string, claimedAt: string, firstAttemptedAt?: string | null }} DeliveryRow
 * @typedef {{ letterId: string, why: string }} Stuck
 */

/** More than `hours` before `at`. An unparseable time reads as longer ago, never as recent. */
function olderThan(time, hours, at) {
  const then = Date.parse(time);
  return Number.isNaN(then) || at.getTime() - then > hours * HOUR_MS;
}

/** @param {DeliveryRow} row @param {Date} at A first attempt that is absent or unreadable is stale; the boundary is inclusive, as `staleClaims` has it. */
function claimIsStale(row, at) {
  const first = Date.parse(row.firstAttemptedAt ?? "");
  return Number.isNaN(first) || at.getTime() - first >= CLAIM_WINDOW_HOURS * HOUR_MS;
}

/** @param {OpenLetter} letter @param {Date} at @returns {string | null} */
function noDelivery(letter, at) {
  // null and absent alike are "has never sent": measured from when it was queued, never from the epoch.
  const since = letter.lastSentAt ?? letter.queuedAt;
  if (since === undefined || since === null || !olderThan(since, NO_PROGRESS_HOURS, at)) return null;
  if (letter.pending > 0) {
    return letter.lastSentAt === undefined || letter.lastSentAt === null
      ? `nothing delivered in the ${NO_PROGRESS_HOURS} hours since it was queued, ${letter.pending} still pending`
      : `no delivery in ${NO_PROGRESS_HOURS} hours, ${letter.pending} still pending`;
  }
  // Nothing pending. In flight is the claim rule's business; with nothing in flight either, the work is done and the letter is not.
  return letter.sending > 0 ? null : "no work left, but it was never marked done";
}

/**
 * What is stuck, one entry per reason: no-delivery entries first, then stale claims, then unknowns,
 * and within each, letters in the order they were given.
 *
 * @param {readonly OpenLetter[]} letters
 * @param {readonly DeliveryRow[]} rows
 * @param {Date} at
 * @returns {Stuck[]}
 */
export function stuck(letters, rows, at) {
  const looked = letters.filter((letter) => letter.state === "queued" || letter.state === "sending");
  /** @type {Stuck[]} */
  const found = [];

  for (const letter of looked) {
    const why = noDelivery(letter, at);
    if (why !== null) found.push({ letterId: letter.id, why });
  }
  for (const letter of looked) {
    const old = rows.filter((row) => row.letterId === letter.id && row.state === "sending" && claimIsStale(row, at));
    if (old.length > 0) found.push({ letterId: letter.id, why: `${old.length} ${old.length === 1 ? "delivery" : "deliveries"} claimed over ${CLAIM_WINDOW_HOURS} hours ago and never marked` });
  }
  for (const letter of looked) {
    const unknown = rows.filter((row) => row.letterId === letter.id && row.state === "unknown");
    if (unknown.length > 0) found.push({ letterId: letter.id, why: `${unknown.length} unknown: we cannot say whether it was sent` });
  }
  return found;
}

/**
 * The lines the runner prints. Built from a letter's id and a reason and nothing else, so no
 * address, subject or body that a row carried can reach it.
 *
 * @param {readonly Stuck[]} entries
 * @param {number} openLetters how many letters were read
 * @param {number} [skipped] how many more could not be read
 * @returns {string[]}
 */
export function summarise(entries, openLetters, skipped = 0) {
  const looked = `${openLetters} open letter${openLetters === 1 ? "" : "s"}`;
  const unread = skipped === 0 ? [] : [`${skipped} letter${skipped === 1 ? "" : "s"} could not be read, so ${skipped === 1 ? "it is" : "they are"} not reported either way.`];
  if (entries.length === 0) {
    return skipped === 0
      ? [`Nothing is stuck: ${looked} read, and each is advancing, or has nothing to advance.`]
      : [`Nothing was found wrong in the ${looked} that could be read.`, ...unread];
  }
  return [`${entries.length} thing${entries.length === 1 ? " is" : "s are"} stuck across ${looked}:`, ...entries.map((entry) => `  letter ${entry.letterId}: ${entry.why}`), ...unread];
}

/**
 * Non-zero the moment anything is stuck, so a check wired to this fails on a send that has quietly
 * stopped rather than on nothing at all. The codes are a SEVERITY LADDER and the highest wins:
 *
 *   0  the store was read in full and nothing is stuck.
 *   1  the store was read in full and something is stuck.
 *   2  the report is incomplete: a letter could not be read (here), or the store could not be, or
 *      the script crashed (the runner). An incomplete report with findings is still incomplete.
 *
 * A letter we could not read must not be masked by a finding elsewhere: the more serious signal
 * (part of the report is unassessable) must not lose to the less serious (we know what is wrong
 * with that letter). Nothing is lost by it, because the output still carries every finding.
 *
 * @param {readonly Stuck[]} entries
 * @param {number} [skipped] letters that could not be read
 * @returns {number}
 */
export function exitCodeFor(entries, skipped = 0) {
  if (skipped > 0) return 2;
  return entries.length > 0 ? 1 : 0;
}
