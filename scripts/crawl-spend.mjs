// GATE C, where it is actually enforced: the only place a provider call is charged to the day's
// budget, and the two decisions that turn the day's ledger into what this run may spend.
//
// ---------------------------------------------------------------------------
// WHY THIS IS A MODULE AND NOT A CLOSURE.
// ---------------------------------------------------------------------------
// All of this began inside `main()` in `crawl-availability.mjs`, which has no test file and no
// exported seam. Review deleted the charge, deleted the fail-closed refusal, and replaced the day's
// ceiling with the run's own — and each deletion left all 2262 unit tests and all 746 pgTAP
// assertions GREEN. Every test the daily budget shipped with proved that a pure function returns
// the right number; not one proved that a caller does anything with it.
//
// So the three decisions live here, where `tests/unit/scripts/crawl-spend.test.ts` drives them
// without a network, a database or a clock, and each test names the deletion it catches.
//
// **Nothing here touches Postgres itself.** `record` and `read` are `crawler-budget.ts`'s two
// functions with the database already bound in, injected by the runner. That is what keeps this
// module testable and what keeps the arithmetic and the store access apart.
//
// Read `crawl-plan.mjs`'s header for the three gates before changing anything about what a run is
// allowed to spend.

import { CALLS_PER_ASK_MAX } from "./crawl-plan.mjs";
import { overBudgetRefusal } from "./crawl-report.mjs";

/** @typedef {import("./crawl-plan.mjs").Route} Route */
/** @typedef {{ ok: true } | { ok: false, reason: string }} Charged */
/** @typedef {{ ok: true, calls: number } | { ok: false, reason: string }} Spend */
/** @typedef {{ ok: true, ceiling: number, dailyCap: number, spentToday: number, remainingToday: number, limitedByDay: boolean, reason: string } | { ok: false, reason: string }} DayVerdict */

/**
 * supabase-js sets no request timeout of its own, so a store call that never answers hangs the run.
 * Every ledger read and every ledger write is bounded by this, and the bound ABORTS rather than
 * merely racing: a race leaves the request in flight, and a request in flight holds the event loop
 * open, so the process would still never exit.
 *
 * **Not every store call this crawler makes is bounded** — the observation-store preflight and
 * `recordObservations` are not, and saying otherwise here would have been a claim nobody checked.
 * Those two hang a run that has spent nothing yet, or one that has already got its rows; this one
 * sits in front of every provider call, which is why it was worth bounding first.
 *
 * What firing early costs differs by call site, and all three directions are safe. On the coverage
 * read the asks are already spent, so it costs one missing print. On gate C's spend read — at the
 * start or before an ask — it costs the run, which is the right direction: an unmeasurable run
 * refuses. On the CHARGE it costs one provider call, given up rather than sent uncounted.
 *
 * Thirty seconds is generous for a call to our own database.
 */
export const STORE_TIMEOUT_MS = 30_000;

/**
 * Wraps `fetch` so that every call the adapter makes is charged to the day's ledger BEFORE it
 * leaves, and so that a call which cannot be charged is never made.
 *
 * **The order is the whole point.** A process killed mid-run has still spent what it sent, and a
 * counter that loses those calls is worse than none: it under-reports exactly when something went
 * wrong. Recording first over-counts a call that never actually goes out — the safe direction,
 * since this run then spends less, never more — and it matches what `calls` has always counted,
 * which is intent rather than completion.
 *
 * **A failed charge throws**, so nothing is sent and `calls` stays where it was: `runCrawl` then
 * sees an ask that spent no call, holds the cursor, records no strike and files it under
 * `notAsked`, which is exactly true. If the ledger stays down, the availability breaker opens on
 * the repeated failures and the run stops of its own accord.
 *
 * **The guard's retry is charged separately**, because it is a second call. One ask can cost two,
 * and a ledger that shows one is a ledger the next run plans against wrongly.
 *
 * @param {{
 *   record: (spentAt: string, options?: { signal?: AbortSignal }) => Promise<Charged>,
 *   fetch?: typeof globalThis.fetch,
 *   maxPerAsk?: number,
 *   timeoutMs?: number,
 *   now?: () => string,
 * }} deps
 */
export function createCountingFetch({ record, fetch: send = globalThis.fetch, maxPerAsk = CALLS_PER_ASK_MAX, timeoutMs = STORE_TIMEOUT_MS, now = () => new Date().toISOString() }) {
  let callsThisAsk = 0;
  /** @type {string | null} */
  let lastRemaining = null;
  let uncharged = 0;

  /** @type {typeof globalThis.fetch} */
  const countingFetch = async (input, init) => {
    if (callsThisAsk >= maxPerAsk) {
      // Unreachable while the loop's own arithmetic holds. If it ever fires, that arithmetic is
      // wrong and the run must fail closed rather than keep spending. It throws BEFORE the charge,
      // so this belt-and-braces path cannot inflate the day's ledger either.
      throw Object.assign(new Error("the per-ask call bound was exceeded"), { name: "AbortError" });
    }
    // Bounded, because this sits in front of every provider call: an insert that hangs would hang
    // the run at its first ask, having printed its banner and nothing else, with no timeout and
    // nothing printed. A timed-out charge is an uncountable call, so it takes the same path a
    // refused one does — given up, never sent.
    const charged = await record(now(), { signal: AbortSignal.timeout(timeoutMs) });
    if (!charged.ok) {
      uncharged += 1;
      throw new Error(`${charged.reason} — so the call was not made: a call this run cannot count is a call the next run will not know about`);
    }
    callsThisAsk += 1;
    const response = await send(input, init);
    lastRemaining = response.headers.get("ratelimit-remaining");
    return response;
  };

  return {
    fetch: countingFetch,
    /** Called as an ask begins: `calls` and `remaining` are per-ask numbers the run reports. */
    beginAsk() {
      callsThisAsk = 0;
      lastRemaining = null;
    },
    /** How many calls this ask has spent — 2 when the guard retried, 0 when nothing left. */
    get calls() {
      return callsThisAsk;
    },
    /** The provider's own `RateLimit-Remaining` from the last response, which is gate B's input. */
    get remaining() {
      return lastRemaining;
    },
    /** Calls given up because the day could not be charged. Printed after the summary. */
    get uncharged() {
      return uncharged;
    },
  };
}

/**
 * May this run start, and with what ceiling — gate C's whole decision, in one place.
 *
 * **It fails closed.** A count that could not be read refuses the run rather than assuming a clean
 * day: an unmeasurable run is precisely the hazard the counter exists to remove, and "the ledger
 * was down" is the one excuse that would let a scheduled crawler spend a month. The refusal carries
 * no ceiling at all, so no caller can read one out of it.
 *
 * **The ceiling it hands back is the DAY's**, which is the smaller of the run's own and what is
 * left of today. Handing back the run's own would compute gate C, print it, and ignore it.
 *
 * @param {{ day: DayVerdict, worstCase: number, routes: readonly Route[] }} at
 * @returns {{ ok: true, ceiling: number } | { ok: false, reason: string }}
 */
export function mayRun({ day, worstCase, routes }) {
  if (!day.ok) return { ok: false, reason: day.reason };
  if (worstCase > day.ceiling) return { ok: false, reason: overBudgetRefusal({ worstCase, ceiling: day.ceiling, routes, day }) };
  return { ok: true, ceiling: day.ceiling };
}

/**
 * Re-reads the day's spend before each ask, and stops the run when what is left will not cover the
 * next one.
 *
 * ---------------------------------------------------------------------------
 * THE CONCURRENCY WINDOW THIS CLOSES, AND HOW FAR IT CLOSES IT.
 * ---------------------------------------------------------------------------
 * The day's count used to be read ONCE, before planning, and never again. Two runs started inside
 * the same window — a scheduler firing while an operator runs it by hand is the obvious case — both
 * read the same spend, both found their worst case fitted, and both spent it: 28 + 28 against a cap
 * of 33, with the 23-call overrun coming straight out of what live PNR checks depend on.
 *
 * This is not a lock and does not pretend to be one. It works because every call inserts its row
 * BEFORE it leaves, so the ledger is self-correcting and a second reader sees the first run's spend
 * as it happens. Re-reading it before each ask turns an unbounded double-spend into roughly one
 * ask's worth per concurrent run — the window between this read and the charge that follows it.
 *
 * Stopping mid-run is this crawler's established behaviour: the burst floor and the per-run ceiling
 * both do it, and the cursors hold, so the combos not reached keep their places.
 *
 * It costs one count query per ask against a run that makes at most fourteen.
 *
 * **It fails closed too**, for the reason `mayRun` does: a spend that can no longer be read means
 * the run can no longer tell what it is spending.
 *
 * @param {{ read: (options?: { signal?: AbortSignal }) => Promise<Spend>, dailyCap: number, perAsk?: number, timeoutMs?: number }} deps
 * @returns {() => Promise<string | null>} why the run must stop, or null to go on
 */
export function createDayGate({ read, dailyCap, perAsk = CALLS_PER_ASK_MAX, timeoutMs = STORE_TIMEOUT_MS }) {
  return async () => {
    const spent = await read({ signal: AbortSignal.timeout(timeoutMs) });
    if (!spent.ok) {
      return (
        `the day's spend could not be re-read, so this run can no longer tell what is left of today's budget: ${spent.reason}. ` +
        "It stops rather than spending blind — the rows already written are kept and the cursors hold."
      );
    }
    const left = Math.max(0, dailyCap - spent.calls);
    if (left < perAsk) {
      return (
        `today's budget is spent: ${spent.calls} of ${dailyCap} calls are charged to it and the next ask could cost ${perAsk}. ` +
        "The count is re-read before every ask, so this is most likely another run of this crawler spending the same day — a scheduler overlapping itself, or a manual run beside a scheduled one. Nothing is lost: the cursors hold and the combos not reached keep their places."
      );
    }
    return null;
  };
}
