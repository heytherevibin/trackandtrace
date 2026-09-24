import { describe, expect, it } from "vitest";
import { REFUSALS_BEFORE_STALE } from "../../../scripts/crawl-plan.mjs";
import { summarise } from "../../../scripts/crawl-report.mjs";
import { runCrawl } from "../../../scripts/crawl-run.mjs";

// ---------------------------------------------------------------------------
// WHAT A RUN IS ENTITLED TO CONCLUDE ABOUT A COMBO.
// ---------------------------------------------------------------------------
// The third file of `runCrawl` tests, and the theme is one thing: a verdict must rest on a question
// the run actually asked. `crawl-run.test.ts` holds the loop, the ceiling, the cursor and the
// invariant; `crawl-run-not-asked.test.ts` holds the zero-call outcomes. Both are at the repo's
// 500-line contract, which is why these live here rather than there.
//
// The branch has now made the same mistake in three places, each one a strike settled on evidence
// that was never collected:
//
//   * a resting breaker was filed as a refusal — fixed, and pinned in `crawl-run-not-asked.test.ts`;
//   * a combo whose pinned ask answered took a strike from its rolling ask — fixed, and pinned in
//     `crawl-run.test.ts`;
//   * **a gate that stops the run between a combo's two asks** settled the strike anyway, against
//     an `answered` set the stop had left incomplete. That is this file.
//
// And one narrower case of the same shape: on the run a sweep wraps, the single step `planAsks`
// emits is marked `rolling` while falling on TODAY — so a refusal of it used to take a strike that
// a pinned refusal at the same date never would.
//
// No key, no network and no database is touched by anything below.
// ---------------------------------------------------------------------------

/** A shape the parser accepts, so each test can spoil exactly one field. */
function route(over: Partial<Record<string, string>> = {}) {
  return { trainNo: "12621", from: "MAS", to: "NDLS", travelClass: "SL", quota: "GN", ...over };
}

const OK = { ok: true as const, answer: { days: [] } };
const REFUSED = { ok: false as const, code: "SOURCE_UNAVAILABLE", message: "could not answer", cause: "server" };
/** The guard's own answer while the availability breaker is open: same code, no cause, nothing sent. */
const RESTING = { ok: false as const, code: "SOURCE_UNAVAILABLE", message: "resting until the provider recovers", retryAfter: 30 };
/** The adapter refusing to build a URL for this route at all: also zero calls, and the opposite meaning. */
const INVALID = { ok: false as const, code: "INVALID", message: "not on this route" };

type Stubbed = typeof OK | typeof REFUSED | typeof RESTING | typeof INVALID;
type Asked = { trainNo: string; from: string; to: string; journeyDate: string; travelClass: string; quota: string };

/** Answers every ask the same way; `calls` may vary by index, because a rest answers while spending nothing. */
function stubAsk(reply: (n: number) => Stubbed, calls: number | ((n: number) => number) = 1, remaining: string | null = null) {
  const seen: { request: Asked }[] = [];
  let n = 0;
  return {
    seen,
    ask: async (request: Asked) => {
      seen.push({ request });
      const at = n++;
      return { outcome: reply(at), calls: typeof calls === "function" ? calls(at) : calls, remaining };
    },
  };
}

const TWO = [route(), route({ trainNo: "12301", from: "HWH", travelClass: "3A" })];
const TODAY = "2026-09-24";
const KEY_ONE = "12621 MAS-NDLS SL/GN";
const KEY_TWO = "12301 HWH-NDLS 3A/GN";

type RunParams = Parameters<typeof runCrawl>[0];

/** Everything but the parts a test is actually about. `ask` is always the test's own. */
function run(over: Partial<RunParams> & Pick<RunParams, "ask">) {
  return runCrawl({
    routes: TWO,
    cursors: {},
    today: TODAY,
    horizonDays: 60,
    windowDays: 4,
    record: async () => 4,
    ceiling: 100,
    ...over,
  });
}

// ---------------------------------------------------------------------------
// F1: a gate stops the run between a combo's rolling refusal and its pinned ask
// ---------------------------------------------------------------------------
// The plan for these is always the same three steps, in this order:
//
//   0. KEY_ONE  rolling  2026-10-02   (its cursor is away from today)
//   1. KEY_ONE  pinned   2026-09-24   (the ask that would say whether the provider knows the route)
//   2. KEY_TWO  rolling  2026-09-24   (no cursor, so its rolling ask already falls on today)
//
// Step 0 refuses. Step 1 is then lost, to one gate or another. Settling the strike at that point
// names a good route a bad list entry — and the runbook tells the operator to DELETE a route that
// lands on that list — on the strength of a question this run never put to the provider.
//
// The fix is to hold: no strike, no clearing, the stored count exactly where it was, and the next
// COMPLETE run decides. The cursor is the other half, and it moves: the rolling ask WAS made and the
// provider DID refuse that date, so the band comes round again next sweep, closer in.
// ---------------------------------------------------------------------------

describe("a gate that stops the run before a combo's pinned ask", () => {
  /** One strike short of the list the runbook says to delete from. */
  const NEARLY = { [KEY_ONE]: { next: "2026-10-02", refusals: REFUSALS_BEFORE_STALE - 1 } };
  const HELD = { next: "2026-10-06", refusals: REFUSALS_BEFORE_STALE - 1 };

  it("holds the strike when the burst floor stops the run — the refusal's own header closes the gate", async () => {
    // `RateLimit-Remaining: 0` arrives on the refusal itself, so the run stops the moment it reads
    // it: after step 0, before step 1.
    const { ask, seen } = stubAsk(() => REFUSED, 1, "0");
    const summary = await run({ ask, cursors: NEARLY, remainingFloor: 0 });

    expect(seen).toHaveLength(1);
    expect(summary.forfeited).toContainEqual({ combo: KEY_ONE, kind: "pinned", date: TODAY });
    expect(summary.stale).toEqual([]);
    expect(summary.cursors[KEY_ONE]).toEqual(HELD);
  });

  it("holds the strike when the run's own ceiling stops it", async () => {
    // One ask costs at most `callsPerAsk` (2), reserved before it begins. Step 0 spends 1, so 1 + 2
    // is over a ceiling of 2 and step 1 never happens.
    const { ask, seen } = stubAsk(() => REFUSED);
    const summary = await run({ ask, cursors: NEARLY, ceiling: 2 });

    expect(seen).toHaveLength(1);
    expect(summary.stopped).toMatch(/ceiling/);
    expect(summary.stale).toEqual([]);
    expect(summary.cursors[KEY_ONE]).toEqual(HELD);
  });

  it("holds the strike when the breaker rests on the pinned ask, which is the likeliest of the three", async () => {
    // The guard opens the availability fuse after five failures inside a minute, so a run that is
    // refusing can trip it on its own next ask. Three days of provider trouble, the fuse opening at
    // the same point in the plan each day, and a good route is condemned.
    const { ask } = stubAsk(
      (n) => (n === 1 ? RESTING : REFUSED),
      (n) => (n === 1 ? 0 : 1),
    );
    const summary = await run({ ask, cursors: NEARLY });

    expect(summary.notAsked[0]).toMatchObject({ combo: KEY_ONE, kind: "pinned", rested: true });
    expect(summary.stale).toEqual([]);
    expect(summary.cursors[KEY_ONE]).toEqual(HELD);
  });

  it("names the held refusal, and says what it did to the cursor", async () => {
    const { ask } = stubAsk(() => REFUSED, 1, "0");
    const summary = await run({ ask, cursors: NEARLY, remainingFloor: 0 });

    expect(summary.withheld).toEqual([
      {
        combo: KEY_ONE,
        date: "2026-10-02",
        wouldHaveBeen: REFUSALS_BEFORE_STALE,
        refusals: REFUSALS_BEFORE_STALE - 1,
        because: expect.stringMatching(/stopped/i),
      },
    ]);
    expect(summary.excused).toEqual([]);
  });

  it("prints it, because an operator reading a stopped run must not have to work out which verdicts it reached", async () => {
    const { ask } = stubAsk(() => REFUSED, 1, "0");
    const printed = summarise(await run({ ask, cursors: NEARLY, remainingFloor: 0 })).join("\n");

    expect(printed).toMatch(/HELD/);
    expect(printed).toMatch(/would have been strike 3 of 3/);
    // The two halves of what the hold means, both on the page: the count did not move, the cursor did.
    expect(printed).toMatch(/count held at 2/);
    expect(printed).toMatch(/next 2026-10-06/);
  });

  it("does not hold a combo the stop never touched: the exemption is per combo, like every other one here", async () => {
    // KEY_TWO's only ask is step 2, past the stop, so it was never asked at all and has nothing to
    // hold. KEY_ONE is the one the stop cost an answer.
    const { ask } = stubAsk(() => REFUSED, 1, "0");
    const summary = await run({ ask, cursors: NEARLY, remainingFloor: 0 });

    expect(summary.withheld.map((one) => one.combo)).toEqual([KEY_ONE]);
    expect(summary.cursors[KEY_TWO]).toBeUndefined();
  });

  // The converse, and it is the load-bearing half: holding must not become a way for a genuinely
  // dead route to live for ever. A run that completed every one of a combo's asks knows enough.
  it("still names a combo stale when the run completed both of its asks and neither answered", async () => {
    const { ask } = stubAsk((n) => (n < 2 ? REFUSED : OK));
    const summary = await run({ ask, cursors: NEARLY });

    expect(summary.stopped).toBeNull();
    expect(summary.withheld).toEqual([]);
    expect(summary.stale).toEqual([`${KEY_ONE} (${REFUSALS_BEFORE_STALE} runs in a row)`]);
  });

  // A zero-call `INVALID` is the other way an ask spends nothing, and it means the opposite of a
  // rest: the adapter refused to build a URL for this route, which is a bad list entry that got past
  // the preflight. That is the combo's own fault, so it holds nothing back.
  it("does not hold on an ask the ADAPTER refused locally: that is evidence about the route, not a lost question", async () => {
    const { ask } = stubAsk(
      (n) => (n === 1 ? INVALID : REFUSED),
      (n) => (n === 1 ? 0 : 1),
    );
    const summary = await run({ ask, cursors: NEARLY });

    expect(summary.withheld).toEqual([]);
    expect(summary.stale).toEqual([`${KEY_ONE} (${REFUSALS_BEFORE_STALE} runs in a row)`]);
  });
});

// ---------------------------------------------------------------------------
// F3: the step a wrap merges onto today
// ---------------------------------------------------------------------------
// On the one run in twenty where a sweep wraps, `nextAsk` returns today and `planAsks` emits ONE
// step rather than two — marked `rolling`, and carrying the outcome row. A refusal of it used to
// take a staleness strike purely because of that mark, while a refusal of the pinned ask at the very
// same date never could: "the train may simply not run today" is a fact about the calendar, not
// about the list.
//
// So the rule is keyed on the DATE and not on `kind`, which is the correction `crawl-report.mjs`
// already had to make for its own count of forfeited outcome rows.
//
// It stays a failure, it stays in `failures`, and it still makes the run un-whole: the band
// beginning today was not covered whatever the step was called.
// ---------------------------------------------------------------------------

describe("the ask a wrap merges onto today", () => {
  /** Beyond the horizon, so `nextAsk` wraps it back to today and emits one merged step. */
  const WRAPPING = { [KEY_ONE]: { next: "2026-12-31", refusals: REFUSALS_BEFORE_STALE - 1 } };

  it("takes no staleness strike, because a refusal at today may only mean the train does not run today", async () => {
    const { ask, seen } = stubAsk(() => REFUSED);
    const summary = await run({ ask, cursors: WRAPPING });

    expect(seen[0]?.request.journeyDate).toBe(TODAY);
    expect(summary.wrapped).toEqual([KEY_ONE]);
    expect(summary.stale).toEqual([]);
    // It produced nothing, which the other count does record — but the staleness count is untouched.
    expect(summary.cursors[KEY_ONE]).toEqual({ next: "2026-09-28", refusals: REFUSALS_BEFORE_STALE - 1, runsWithoutRows: 1 });
  });

  it("is still a failure and still makes the run un-whole: the band beginning today is a hole either way", async () => {
    const { ask } = stubAsk((n) => (n === 0 ? REFUSED : OK));
    const summary = await run({ ask, cursors: WRAPPING });

    expect(summary.failures).toEqual([{ combo: KEY_ONE, date: TODAY, code: "SOURCE_UNAVAILABLE", why: expect.stringMatching(/could not answer/) }]);
    expect(summary.whole).toBe(false);
  });

  it("is not held either: nothing was lost, so there is nothing to wait for", async () => {
    const { ask } = stubAsk((n) => (n === 0 ? REFUSED : OK));
    const summary = await run({ ask, cursors: WRAPPING });

    expect(summary.withheld).toEqual([]);
    expect(summary.excused).toEqual([]);
  });

  // The converse: a rolling refusal anywhere else in the sweep is exactly as countable as it was.
  // Both of KEY_ONE's asks refuse here, so nothing excuses it either — the strike is the date's.
  it("leaves a rolling refusal AWAY from today counting as it always did", async () => {
    const { ask } = stubAsk((n) => (n < 2 ? REFUSED : OK));
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 0 } } });

    expect(summary.cursors[KEY_ONE]).toEqual({ next: "2026-10-06", refusals: 1, runsWithoutRows: 1 });
  });
});
