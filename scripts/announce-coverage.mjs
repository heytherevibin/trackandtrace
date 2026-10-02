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
//   1. NO DELIVERY IN 48 HOURS. A letter with rows still pending whose last delivery was more than
//      48 hours ago. The job runs daily, so two runs without progress mean it is not running, or
//      every send is failing; either way a person should look. Strictly more than 48 hours: a run
//      that is a few minutes late must not raise it.
//        * A letter that has NEVER SENT has `lastSentAt` null (or absent: the store does not supply
//          the field yet, and absent is read exactly as null). Null is "has never sent", NEVER the
//          epoch: as the epoch every freshly queued letter would be 56 years stale and the report
//          would cry wolf on its first run. What a never-sent letter is measured from is the time
//          it was queued, so it is named once it has sat 48 hours with rows pending and has still
//          not sent one. That is the case this report most needs to catch (queued, and the job
//          never ran, or never once succeeded), and reading null as "nothing to measure" would leave
//          it silent for ever. With neither time known there is nothing to measure from and nothing
//          is said.
//        * A time that cannot be parsed is not recent progress: it is named, never excused.
//   2. A DELIVERY CLAIMED OVER 24 HOURS AGO AND NEVER MARKED. A row still `sending` past the
//      provider's idempotency window. The runner marks such a row unknown rather than retry it, so
//      one that is still `sending` means the runner is not reaching it. The age is measured from the
//      FIRST attempt, not the latest claim: a re-claim does not renew the provider's memory of the
//      key. Where the first attempt was never recorded the latest claim stands in. A claim whose
//      time cannot be parsed is counted, never excused.
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
//   * UNKNOWN DELIVERIES, TODAY. The only per-delivery read there is, `openClaims`, returns rows
//     that are `sending`; it never returns an `unknown` one. Rule 3 is therefore proven here and
//     fed nothing by the runner until a read for unknown deliveries exists.
//   * PROGRESS, until the store supplies `lastSentAt`. It is meant to come from `announce_remaining`
//     and, absent, every letter reads as one that has never sent, so a letter that IS sending is
//     named once it is more than 48 hours old with rows pending. The runner says when that is so.
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
 * @typedef {{ id: string, state: string, pending: number, lastSentAt?: string | null, queuedAt?: string }} OpenLetter
 * @typedef {{ letterId: string, personId?: string, state: string, claimedAt: string, firstAttemptedAt?: string | null }} DeliveryRow
 * @typedef {{ letterId: string, why: string }} Stuck
 */

/** More than `hours` before `at`. An unparseable time reads as longer ago, never as recent. */
function olderThan(time, hours, at) {
  const then = Date.parse(time);
  return Number.isNaN(then) || at.getTime() - then > hours * HOUR_MS;
}

/** @param {OpenLetter} letter @param {Date} at @returns {string | null} */
function noDelivery(letter, at) {
  if (!(letter.pending > 0)) return null;
  // null and absent alike are "has never sent": measured from when it was queued, never from the epoch.
  if (letter.lastSentAt !== null && letter.lastSentAt !== undefined) {
    return olderThan(letter.lastSentAt, NO_PROGRESS_HOURS, at) ? `no delivery in ${NO_PROGRESS_HOURS} hours, ${letter.pending} still pending` : null;
  }
  if (letter.queuedAt === undefined || letter.queuedAt === null) return null;
  return olderThan(letter.queuedAt, NO_PROGRESS_HOURS, at) ? `nothing delivered in the ${NO_PROGRESS_HOURS} hours since it was queued, ${letter.pending} still pending` : null;
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
    const old = rows.filter((row) => row.letterId === letter.id && row.state === "sending" && olderThan(row.firstAttemptedAt ?? row.claimedAt, CLAIM_WINDOW_HOURS, at));
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
 * @param {number} openLetters how many letters were looked at
 * @returns {string[]}
 */
export function summarise(entries, openLetters) {
  const looked = `${openLetters} open letter${openLetters === 1 ? "" : "s"}`;
  if (entries.length === 0) return [`Nothing is stuck: ${looked} read, and each is advancing, or has nothing to advance.`];
  return [`${entries.length} thing${entries.length === 1 ? " is" : "s are"} stuck across ${looked}:`, ...entries.map((entry) => `  letter ${entry.letterId}: ${entry.why}`)];
}

/**
 * Non-zero the moment anything is stuck, so a check wired to this fails on a send that has quietly
 * stopped rather than on nothing at all.
 *
 * @param {readonly Stuck[]} entries
 * @returns {number}
 */
export function exitCodeFor(entries) {
  return entries.length === 0 ? 0 : 1;
}
