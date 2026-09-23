// The availability crawler's rolling window: which single date each combo asks for next, where
// its cursor goes afterwards, and how the cursor file is read.
//
// Pure arithmetic over ISO dates — no network, no database, no clock; the caller says what today
// is. This is the piece whose coverage property has to be right, which is why it stands on its
// own: the tests drive these four functions exactly as the crawler drives them, for a hundred and
// twenty simulated runs, and assert both what is guaranteed and what is not.
//
// ---------------------------------------------------------------------------
// SPARSE, NOT DENSE. One ask per combo per run.
// ---------------------------------------------------------------------------
// Each combo keeps a cursor: the journey date to ask for next. A run asks that one date, then moves
// the cursor on by one window. Tomorrow's run asks four days further out while today has moved one
// day closer, so the distance from departure grows by `windowDays - 1` each run until the cursor
// passes the horizon, when it wraps back to today and sweeps again.
//
// The alternative — sweeping the whole sixty-day horizon every run — costs `ceil(60/4) = 15` calls
// per combo per run instead of one, which is what makes a plan of 333 calls a day fund two combos
// instead of sixteen. It is also the wrong shape for the data: what a clearance model needs is each
// journey date seen at a few DIFFERENT distances from departure, not at all sixty. A rolling window
// gives exactly that, and gives it for the price of one call.
//
// What the rolling window guarantees, proved in `tests/unit/scripts/crawl-plan.test.ts`:
//
//   * No calendar day is ever skipped. Inside one sweep the windows are contiguous and never
//     overlap, so every date from where a sweep began to where it reached is asked exactly once.
//   * Nothing in the past is ever asked (a past date answers 400 and is lost for good), and nothing
//     beyond the horizon.
//   * In the steady state — once the crawler has been running at least one horizon — a journey date
//     is asked once per sweep from the day it enters the horizon until departure: four observations
//     at a sixty-day horizon and a four-day window, at roughly 45, 30, 15 and 0 days out.
//
// What it does NOT guarantee, said plainly because it is a sample: no journey date is observed at
// every distance, or at any particular one. Which distances a date gets depends on where the sweep
// happened to be when it entered the horizon.
//

/** Where a combo got to, and how many runs in a row it has refused. */
/** @typedef {{ next: string, refusals: number }} CursorEntry */
/** @typedef {Record<string, CursorEntry>} Cursors */
/** @typedef {{ ok: true, cursors: Cursors } | { ok: false, issues: string[] }} ParsedCursors */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/**
 * How far one call reaches, and therefore how far the cursor moves each run.
 *
 * Measured 2026-09-23: `/seats` answers **four dated entries** running forward from the date asked
 * for — which is not the same as the asked date plus the next three. 12301 HWH-NDLS 3A/GN asked for
 * 2026-10-15 answered 15, 16, 17 and **19**: four entries over five days, the 18th simply absent.
 * A quota can shorten it too — a TQ combo answered two, which is what a Tatkal window that opens a
 * day before departure should look like.
 *
 * **Four is still right, and a stride of three would be worse on both counts.** The entries are the
 * next four days the train runs, at or after the date asked for; a four-day span holds at most four
 * days, so every running day in `[D, D+3]` is inside those four entries. A day the provider omits
 * is a day it has nothing to say about, not a hole the stride opened, and entries that run past
 * `D+3` are a free early look at the next window rather than a loss.
 *
 * Shrinking the stride to 3 would not buy safety: it would make the sweep take `ceil(60/2) = 30`
 * runs instead of 20, so each journey date would be observed fewer times, for the same cost per run.
 * See `cycleRuns`.
 *
 * The residual risk, named rather than hidden: if the provider ever truncated a window while running
 * days remained inside it, a dense sweep would re-read that band the next day and a sparse one will
 * not come back for a sweep. Nothing observed suggests it does, and the run reports every window
 * that came back short so the pattern would be visible rather than silent.
 */
export const DEFAULT_WINDOW_DAYS = 4;
export const DEFAULT_HORIZON_DAYS = 60;

function utcDay(iso) {
  const match = ISO_DATE.exec(String(iso).trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const at = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const probe = new Date(at);
  if (probe.getUTCFullYear() !== Number(y) || probe.getUTCMonth() !== Number(m) - 1 || probe.getUTCDate() !== Number(d)) return null;
  return at;
}

/** ISO in, ISO out, through UTC milliseconds — so a month end or a leap day cannot drift. */
export function addDays(iso, days) {
  const at = utcDay(iso);
  if (at === null) throw new RangeError(`not an ISO date: ${iso}`);
  return new Date(at + days * DAY_MS).toISOString().slice(0, 10);
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a whole number of days, at least 1; got ${value}`);
  return value;
}

/**
 * How many runs a sweep of the horizon takes.
 *
 * The cursor gains `windowDays` a run while today gains one, so the distance from departure grows by
 * `windowDays - 1` each run. **This is why a smaller stride is not a safer one:** at a window of 3 a
 * sweep takes 30 runs instead of 20, so each journey date is seen fewer times, for exactly the same
 * cost per run.
 *
 * @param {number} horizonDays
 * @param {number} windowDays
 * @returns {number}
 */
export function cycleRuns(horizonDays, windowDays) {
  positiveInteger(horizonDays, "horizonDays");
  positiveInteger(windowDays, "windowDays");
  if (windowDays < 2) throw new RangeError("windowDays must be at least 2: at 1 the cursor advances exactly as fast as today and the sweep never moves out");
  return Math.ceil(horizonDays / (windowDays - 1));
}

/**
 * Which single date this combo asks for now, and whether the cursor had to be reset to get there.
 *
 * Four cases, and each `reset` value is a different thing an operator should be able to read:
 *
 *   `none`        — the cursor is inside the horizon; ask exactly where it points.
 *   `beyond`      — the sweep has run off the far end. Wrap to today and sweep again, closer in.
 *   `behind`      — the cursor is in the past, because the crawler has not been run for a while.
 *                   Restart at today: a past date answers 400 and is lost for good either way.
 *   `unreadable`  — there was a cursor and it could not be read. Start at today rather than guess.
 *
 * @param {{ cursor?: string, today: string, horizonDays: number, windowDays: number }} at
 * @returns {{ date: string, reset: "none" | "beyond" | "behind" | "unreadable" }}
 */
export function nextAsk({ cursor, today, horizonDays, windowDays }) {
  if (utcDay(today) === null) throw new RangeError(`not an ISO date: ${today}`);
  cycleRuns(horizonDays, windowDays);
  if (cursor === undefined || cursor === null) return { date: today, reset: "none" };
  const at = utcDay(cursor);
  if (at === null) return { date: today, reset: "unreadable" };
  const out = Math.round((at - /** @type {number} */ (utcDay(today))) / DAY_MS);
  if (out < 0) return { date: today, reset: "behind" };
  if (out > horizonDays - 1) return { date: today, reset: "beyond" };
  return { date: cursor, reset: "none" };
}

/**
 * Where the cursor points after asking `asked`: exactly one window on, so the next ask begins where
 * this one ended and the windows inside a sweep are contiguous, never overlapping.
 *
 * @param {string} asked
 * @param {number} windowDays
 * @returns {string}
 */
export function advanceCursor(asked, windowDays) {
  positiveInteger(windowDays, "windowDays");
  return addDays(asked, windowDays);
}

/** Every day the given asks actually cover. The test for "no gap, no repeat" is written against this. */
export function coveredDates(asks, windowDays) {
  positiveInteger(windowDays, "windowDays");
  return asks.flatMap((date) => Array.from({ length: windowDays }, (_, i) => addDays(date, i)));
}

/**
 * The cursor file, parsed and never coerced. `null` is the normal first run: no file yet, every
 * combo starts at today.
 *
 * A cursor read wrong is a crawl starting from a place nobody chose, so anything unreadable is
 * refused outright rather than repaired.
 *
 * @param {string | null} text
 * @returns {ParsedCursors}
 */
export function parseCursors(text) {
  if (text === null || text === undefined || text.trim() === "") return { ok: true, cursors: {} };
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    return { ok: false, issues: [`the cursor file is not JSON: ${error.message}`] };
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false, issues: ["the cursor file must be a JSON object keyed by combo"] };

  /** @type {string[]} */
  const issues = [];
  /** @type {Cursors} */
  const cursors = {};
  for (const [key, entry] of Object.entries(body)) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) issues.push(`cursor ${key}: must be an object`);
    else if (typeof entry.next !== "string" || utcDay(entry.next) === null) issues.push(`cursor ${key}: next must be an ISO date`);
    else if (!Number.isInteger(entry.refusals) || entry.refusals < 0) issues.push(`cursor ${key}: refusals must be a whole number, zero or more`);
    else cursors[key] = { next: entry.next, refusals: entry.refusals };
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, cursors };
}


/**
 * Whole days from one ISO date to another, negative when `to` is the earlier. The one place the
 * crawler turns two dates into a distance, so "days out" always means the same thing.
 *
 * @param {string} from
 * @param {string} to
 * @returns {number}
 */
export function daysBetween(from, to) {
  const a = utcDay(from);
  const b = utcDay(to);
  if (a === null || b === null) throw new RangeError(`not an ISO date: ${a === null ? from : to}`);
  return Math.round((b - a) / DAY_MS);
}
