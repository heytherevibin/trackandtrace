import { describe, expect, it } from "vitest";
import { REFUSALS_BEFORE_STALE } from "../../../scripts/crawl-plan.mjs";
import { summarise } from "../../../scripts/crawl-report.mjs";
import { runCrawl } from "../../../scripts/crawl-run.mjs";

// ---------------------------------------------------------------------------
// STALENESS IS A VERDICT ON WHETHER THE PROVIDER KNOWS THE ROUTE.
// ---------------------------------------------------------------------------
// Split out of `crawl-run.test.ts` when that file came within four lines of the repo's 500-line
// contract. The three blocks below belong together: they are the invariant the Tatkal fix turns on,
// and its two boundaries.
//
// Three consecutive ROLLING refusals put a combo on the `stale` list, and the runbook tells the
// operator to DELETE such a combo from `routes.json`. That is a verdict about the ROUTE, so it must
// rest on evidence about the route:
//
//   * a combo whose quota only opens near departure makes no rolling ask at all, so it cannot
//     accrue one -- both Tatkal combos on the shipped list reached `refusals: 2` before this, one
//     run from being named bad entries for being Tatkal;
//   * a combo that ANSWERED some other ask this run has proved the provider knows it, so its
//     rolling refusal earns no strike and the count is cleared;
//   * and a combo where EVERYTHING refuses is exactly what the list is for -- 12951 answered
//     `Unable to process your request` for every class and date tried -- so it still goes stale on
//     the third run, unchanged. That boundary is the reason the other two are safe.
//
// No key, no network and no database is touched by anything below.
// ---------------------------------------------------------------------------

/** A shape the parser accepts, so each test can spoil exactly one field. */
function route(over: Partial<Record<string, string>> = {}) {
  return { trainNo: "12621", from: "MAS", to: "NDLS", travelClass: "SL", quota: "GN", ...over };
}

const OK = { ok: true as const, answer: { days: [] } };
const REFUSED = { ok: false as const, code: "SOURCE_UNAVAILABLE", message: "could not answer", cause: "server" };
const INVALID = { ok: false as const, code: "INVALID", message: "not on this route" };
// The zero-call outcomes — a resting breaker, a route the adapter refuses before building a URL —
// live in `crawl-run-not-asked.test.ts` with their own stubs.
type Stubbed = typeof OK | typeof REFUSED | typeof INVALID;
type Asked = { trainNo: string; from: string; to: string; journeyDate: string; travelClass: string; quota: string };

/**
 * Answers every ask the same way, and counts what the run actually asked for.
 *
 * `calls` may be a function of the ask's index, because the whole of the resting bug is that an ask
 * can answer while spending nothing — a fixed `calls` cannot express it.
 */
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
// A combo whose quota only opens near departure: one ask, and the loop still counts it
// ---------------------------------------------------------------------------

describe("a pinned-only combo", () => {
  const TQ = [route({ quota: "TQ" })];
  const KEY_TQ = "12621 MAS-NDLS SL/TQ";
  const AWAY = { [KEY_TQ]: { next: "2026-10-02", refusals: 2 } };

  it("is still counted as a combo the run attempted, although it made no rolling ask", async () => {
    const { ask, seen } = stubAsk(() => OK);
    const summary = await run({ ask, routes: TQ, cursors: AWAY });

    expect(seen.map((s) => s.request.journeyDate)).toEqual([TODAY]);
    expect(summary.combos).toBe(1);
    expect(summary.asks).toBe(1);
    expect(summary.planned).toBe(1);
    expect(summary.whole).toBe(true);
  });

  it("leaves its cursor exactly where it was: there is no sweep to advance", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await run({ ask, routes: TQ, cursors: AWAY });
    expect(summary.cursors[KEY_TQ]).toEqual({ next: "2026-10-02", refusals: 2 });
  });

  it("cannot be named stale by its pinned ask alone, because a train may simply not run today", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask, routes: TQ, cursors: { [KEY_TQ]: { next: "2026-10-02", refusals: REFUSALS_BEFORE_STALE } } });

    expect(summary.stale).toEqual([]);
    expect(summary.pinnedFailures).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The invariant: an ask that ANSWERED is proof the provider knows this route
// ---------------------------------------------------------------------------
// Staleness exists to find a route the provider does not know — 12951 answered `Unable to process
// your request` for every class and date tried. A combo that answers AT ALL is not that combo, so a
// refusal of its rolling ask is not evidence of a bad list entry and must not earn a strike.
//
// Measured on the shipped list over two real runs, 2026-09-23 and 2026-09-24. 12301 HWH-NDLS 2A/TQ:
// the pinned ask at today answered two rows both days, while the rolling ask refused at 4 and at 7
// days out. Both Tatkal combos reached `refusals: 2`, and the next run would have named them bad
// list entries and told the operator to delete the very GN/TQ pair the list exists for.
// ---------------------------------------------------------------------------

describe("a rolling refusal from a combo whose pinned ask ANSWERED", () => {
  const NEARLY = { [KEY_ONE]: { next: "2026-10-02", refusals: REFUSALS_BEFORE_STALE - 1 } };
  /** Rolling refuses, the same combo's pinned ask answers, the second combo answers. */
  const TATKAL_SHAPED = (n: number) => (n === 0 ? REFUSED : OK);

  it("takes no staleness strike, so a blameless combo is never named a bad list entry", async () => {
    const { ask } = stubAsk(TATKAL_SHAPED);
    const summary = await run({ ask, cursors: NEARLY });

    expect(summary.stale).toEqual([]);
    expect(summary.cursors[KEY_ONE]?.refusals).toBe(0);
  });

  it("clears the count outright, exactly as an answered ROLLING ask does — the proof is the same proof", async () => {
    const { ask } = stubAsk(TATKAL_SHAPED);
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 2 } } });
    // Merely withholding the strike would leave the count stuck one short of stale for ever, so the
    // first day the train genuinely does not run would tip it over.
    expect(summary.cursors[KEY_ONE]?.refusals).toBe(0);
  });

  it("still reports the refusal and still makes the run un-whole: the band it asked for is a hole either way", async () => {
    const { ask } = stubAsk(TATKAL_SHAPED);
    const summary = await run({ ask, cursors: NEARLY });

    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]?.date).toBe("2026-10-02");
    expect(summary.whole).toBe(false);
  });

  it("still advances the cursor, because a refusal is the provider's verdict on that date", async () => {
    const { ask } = stubAsk(TATKAL_SHAPED);
    const summary = await run({ ask, cursors: NEARLY });
    expect(summary.cursors[KEY_ONE]?.next).toBe("2026-10-06");
  });

  it("names the excused refusal, so a counter that did not move is not a mystery", async () => {
    const { ask } = stubAsk(TATKAL_SHAPED);
    const summary = await run({ ask, cursors: NEARLY });

    expect(summary.excused).toEqual([{ combo: KEY_ONE, date: "2026-10-02", refusals: REFUSALS_BEFORE_STALE }]);
  });
});

describe("a combo where EVERYTHING refuses", () => {
  it("still goes stale on the same schedule — this is the only thing that finds a genuinely bad entry", async () => {
    // Both of KEY_ONE's asks refuse; nothing answers for it, so nothing excuses it.
    const { ask } = stubAsk((n) => (n < 2 ? REFUSED : OK));
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: REFUSALS_BEFORE_STALE - 1 } } });

    expect(summary.cursors[KEY_ONE]?.refusals).toBe(REFUSALS_BEFORE_STALE);
    expect(summary.stale).toEqual([`${KEY_ONE} (${REFUSALS_BEFORE_STALE} runs in a row)`]);
    expect(summary.excused).toEqual([]);
  });

  it("is not excused by a DIFFERENT combo answering: the exemption is per combo, not per run", async () => {
    const { ask } = stubAsk((n) => (n < 2 ? REFUSED : OK));
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: REFUSALS_BEFORE_STALE - 1 } } });

    // KEY_TWO answered this run. That says nothing whatever about KEY_ONE.
    expect(summary.cursors[KEY_TWO]?.refusals).toBe(0);
    expect(summary.stale).toEqual([`${KEY_ONE} (${REFUSALS_BEFORE_STALE} runs in a row)`]);
  });

  it("is not excused by an ask that never reached the provider, which is the absence of a verdict", async () => {
    // KEY_ONE's rolling ask refuses for real; its pinned one spends no call. Nothing KEY_ONE was
    // asked answered, so the strike stands — a request nobody received cannot prove the provider
    // knows the route. KEY_TWO answers, which is what entitles this run to judge KEY_ONE at all:
    // see "a run in which NO ask answered" below.
    const { ask } = stubAsk(
      (n) => (n === 0 ? REFUSED : n === 1 ? INVALID : OK),
      (n) => (n === 1 ? 0 : 1),
    );
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: REFUSALS_BEFORE_STALE - 1 } } });

    expect(summary.stale).toEqual([`${KEY_ONE} (${REFUSALS_BEFORE_STALE} runs in a row)`]);
  });
});

// ---------------------------------------------------------------------------
// A RUN IN WHICH NOTHING ANSWERED STRIKES NOBODY
// ---------------------------------------------------------------------------
// The two blocks above turn on one word: ANSWERED. This is what happens when that word is true of
// nothing in the whole run.
//
// A dead route and a dead provider arrive in the same words. 12951 answers `Unable to process your
// request` for every class and date tried; IRCTC down answers `Oops! Seems like IRCTC services are
// down at the moment.` Both are a 400, both the adapter maps to `SOURCE_UNAVAILABLE(server)`, both
// spend a call. Nothing inside the refusal separates them, and nothing can. The only signal that
// does is whether something ELSE answered: if some combos answered and this one did not, that is
// about the route; if none did, that is about the provider.
//
// Measured 2026-09-24: twelve consecutive asks for 12137 CSMT-NDLS 3A/GN -- which answered normally
// on the 23rd and the 24th -- all came back with that 400. Driven through the real `runCrawl` with
// the shipped six-combo list, five days of it put EVERY GN combo on the stale list on day four, and
// the runbook tells the operator to delete what lands there.
// ---------------------------------------------------------------------------

describe("a run in which NO ask answered", () => {
  /** One strike short of the list the runbook says to delete from. */
  const NEARLY = { [KEY_ONE]: { next: "2026-10-02", refusals: REFUSALS_BEFORE_STALE - 1 } };

  it("strikes nobody, so somebody else's outage cannot empty the route list", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask, cursors: NEARLY });

    expect(summary.stale).toEqual([]);
  });

  it("HOLDS the count where the last informative run left it, rather than clearing it", async () => {
    // Clearing would erase a real strike sequence that an outage merely interrupted -- the other
    // way to lose 12951, and the reason this is a hold and not a reset.
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask, cursors: NEARLY });

    expect(summary.cursors[KEY_ONE]?.refusals).toBe(REFUSALS_BEFORE_STALE - 1);
  });

  it("still advances the cursor, because the provider did refuse the date it was asked for", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask, cursors: NEARLY });

    expect(summary.cursors[KEY_ONE]?.next).toBe("2026-10-06");
  });

  it("names what it held, so a wall of refusals with no verdict is not read as verdicts still coming", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask, cursors: NEARLY });

    expect(summary.blind).toEqual([{ combo: KEY_ONE, date: "2026-10-02", wouldHaveBeen: REFUSALS_BEFORE_STALE, refusals: REFUSALS_BEFORE_STALE - 1 }]);
    // Not the other two verdicts: nothing was excused, and no gate cost this run a question.
    expect(summary.excused).toEqual([]);
    expect(summary.withheld).toEqual([]);
  });

  it("prints it in its own words, apart from the refusals it is a verdict about", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const printed = summarise(await run({ ask, cursors: NEARLY })).join("\n");

    expect(printed).toMatch(/NOTHING IN THIS RUN ANSWERED/);
    expect(printed).toMatch(/would have been strike 3 of 3/);
    expect(printed).toMatch(/count held at 2/);
  });

  // The count is held, not frozen: the moment a run learns something again, it counts again.
  it("lets the count move again on the first run in which anything answers", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const dark = await run({ ask, cursors: NEARLY });
    const lit = stubAsk((n) => (n < 2 ? REFUSED : OK));
    const after = await run({ ask: lit.ask, cursors: dark.cursors });

    expect(after.stale).toEqual([`${KEY_ONE} (${REFUSALS_BEFORE_STALE} runs in a row)`]);
  });

  // `runsWithoutRows` is deliberately NOT held. It says "this combo produced no rows", which is
  // TRUE in an outage, and its verdict is only *go and look* -- never *delete*. It is also the only
  // instrument left on a one-combo list, below.
  it("still lets the produced-no-rows count climb, because an outage is a real hole in the dataset", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 0, runsWithoutRows: 3 } } });

    expect(summary.cursors[KEY_ONE]?.runsWithoutRows).toBe(4);
  });

  // The price, named here and in the runbook's blind-spot list rather than left to be discovered:
  // on a list of one, "nothing answered" and "my only route is dead" are the same observation. This
  // is the safe direction -- a route kept too long costs a call a run; a route deleted wrongly
  // costs the dataset -- and the count above still climbs and still reports.
  it("cannot reach the stale list at all on a ONE-COMBO route list, which is the price of the rule", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask, routes: [route()], cursors: NEARLY });

    expect(summary.stale).toEqual([]);
    expect(summary.cursors[KEY_ONE]?.runsWithoutRows).toBe(1);
  });
});
