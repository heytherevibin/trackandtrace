import { describe, expect, it } from "vitest";
import { RUNS_WITHOUT_ROWS_BEFORE_NOTICE } from "../../../scripts/crawl-plan.mjs";
import { summarise } from "../../../scripts/crawl-report.mjs";
import { runCrawl } from "../../../scripts/crawl-run.mjs";
import { parseCursors } from "../../../scripts/crawl-window.mjs";

// ---------------------------------------------------------------------------
// IS THIS COMBO PRODUCING ANY DATA AT ALL?
// ---------------------------------------------------------------------------
// The stale list answers a narrow question — "has the provider ever heard of this route?" — and its
// answer is `delete the entry`. It cannot see a combo that is alive and useless:
//
//   * a PINNED-ONLY combo (a Tatkal quota) has no rolling ask to refuse, and a pinned refusal has
//     never counted, so it can never reach the list however long it has been dead;
//   * a combo whose ROLLING ask is permanently dead while its pinned ask answers is excused every
//     single run by the invariant, correctly, and quietly becomes a pinned-only sampler;
//   * a combo the provider answers while the STORE writes nothing is nobody's bad list entry.
//
// The coverage report does not catch these promptly either: its exit code is an aggregate, so one
// dead combo out of six takes about a fortnight to cross the threshold on a 30-day history and
// about six weeks on a 90-day one — and a combo that has NEVER produced a row has no first
// observation, so it is excluded from the denominator and reads 100%, exit 0, indefinitely.
//
// So the crawler counts the one thing it always knows: did any ask of this combo produce a row this
// run? The count lives in the cursor file beside `refusals`, it clears the moment a row lands, and
// at the threshold it gets its own section — which says GO AND LOOK and never says delete.
//
// No key, no network and no database is touched by anything below.
// ---------------------------------------------------------------------------

function route(over: Partial<Record<string, string>> = {}) {
  return { trainNo: "12621", from: "MAS", to: "NDLS", travelClass: "SL", quota: "GN", ...over };
}

const OK = { ok: true as const, answer: { days: [] } };
const REFUSED = { ok: false as const, code: "SOURCE_UNAVAILABLE", message: "could not answer", cause: "server" };
const RESTING = { ok: false as const, code: "SOURCE_UNAVAILABLE", message: "resting until the provider recovers", retryAfter: 30 };

type Stubbed = typeof OK | typeof REFUSED | typeof RESTING;
type Asked = { trainNo: string; from: string; to: string; journeyDate: string; travelClass: string; quota: string };

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
/** A Tatkal combo: `QUOTAS_OPENING_NEAR_DEPARTURE` gives it the pinned ask and nothing else. */
const TQ = [route({ quota: "TQ" })];
const KEY_TQ = "12621 MAS-NDLS SL/TQ";

type RunParams = Parameters<typeof runCrawl>[0];

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

describe("the count of consecutive runs a combo produced no rows in", () => {
  it("counts a run in which the combo was asked and wrote nothing", async () => {
    const { ask } = stubAsk((n) => (n < 2 ? REFUSED : OK));
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 0 } } });

    expect(summary.cursors[KEY_ONE]?.runsWithoutRows).toBe(1);
    expect(summary.cursors[KEY_TWO]?.runsWithoutRows).toBeUndefined();
  });

  it("counts a PINNED-ONLY combo, which is the case no other instrument can see", async () => {
    // A Tatkal entry the provider will not answer for. Nothing about it can ever reach the stale
    // list, and until this count existed nothing else named it either.
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask, routes: TQ, cursors: { [KEY_TQ]: { next: TODAY, refusals: 0, runsWithoutRows: 5 } } });

    expect(summary.cursors[KEY_TQ]?.runsWithoutRows).toBe(6);
    expect(summary.stale).toEqual([]);
  });

  it("gives a combo with no cursor entry at all somewhere to keep the count", async () => {
    // A pinned-only combo makes no rolling ask, so nothing has ever written it a cursor. The count
    // still has to live somewhere, and `today` is exactly where `nextAsk` would start it anyway.
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask, routes: TQ, cursors: {} });

    expect(summary.cursors[KEY_TQ]).toEqual({ next: TODAY, refusals: 0, runsWithoutRows: 1 });
  });

  it("clears the moment the combo writes anything, whichever ask wrote it", async () => {
    const { ask } = stubAsk((n) => (n === 0 ? REFUSED : OK));
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 0, runsWithoutRows: 6 } } });

    // Cleared by DELETING the field: absent means zero, which is how a file written before this
    // existed already reads.
    expect(summary.cursors[KEY_ONE]).toEqual({ next: "2026-10-06", refusals: 0 });
  });

  it("counts a combo the provider answered while the store wrote nothing: that is still no data", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await run({ ask, record: async () => 0, routes: [route()], cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 0 } } });

    expect(summary.cursors[KEY_ONE]?.runsWithoutRows).toBe(1);
  });

  // The same rule the strike follows, for the same reason: a combo cannot be judged by a question
  // the run did not put to the provider.
  it("does not count a run that never reached the provider for that combo", async () => {
    const { ask } = stubAsk(
      (n) => (n === 0 ? RESTING : OK),
      (n) => (n === 0 ? 0 : 1),
    );
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 0, runsWithoutRows: 3 } } });

    expect(summary.cursors[KEY_ONE]?.runsWithoutRows).toBe(3);
  });

  // The case above rests on the combo's FIRST step, where the rest also stops the run — so the
  // count survives whether or not the `unasked` guard exists. This is the one the guard is actually
  // for: the rolling ask is put to the provider and refused, and the PINNED ask then rests. The
  // combo produced nothing, but one of its two questions was never asked, so the run does not know
  // that it produces nothing.
  it("does not count a combo whose FIRST ask was answered and whose second one rested", async () => {
    const { ask } = stubAsk(
      (n) => (n === 1 ? RESTING : REFUSED),
      (n) => (n === 1 ? 0 : 1),
    );
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 0, runsWithoutRows: 3 } } });

    expect(summary.cursors[KEY_ONE]?.runsWithoutRows).toBe(3);
  });

  it("does not count a run a gate stopped before the combo's other ask", async () => {
    // The refusal's own header closes the burst gate, so the pinned ask that might have produced
    // rows was forfeited. The run does not know, so it does not count.
    const { ask } = stubAsk(() => REFUSED, 1, "0");
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 0, runsWithoutRows: 3 } }, remainingFloor: 0 });

    expect(summary.cursors[KEY_ONE]?.runsWithoutRows).toBe(3);
  });

  it("does not count a combo this run never asked about at all", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await run({ ask, routes: [route()], cursors: { [KEY_TWO]: { next: "2026-11-01", refusals: 0, runsWithoutRows: 4 } } });

    expect(summary.cursors[KEY_TWO]).toEqual({ next: "2026-11-01", refusals: 0, runsWithoutRows: 4 });
  });

  it("reads a cursor file written before this field existed as a zero, and complains about nothing", async () => {
    const before = parseCursors(`{"${KEY_ONE}":{"next":"2026-10-02","refusals":1}}`);
    expect(before).toEqual({ ok: true, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 1 } } });

    const { ask } = stubAsk((n) => (n < 2 ? REFUSED : OK));
    const summary = await run({ ask, cursors: before.ok ? before.cursors : {} });
    expect(summary.cursors[KEY_ONE]?.runsWithoutRows).toBe(1);
  });

  it("refuses a count that is not a whole number of runs, rather than repairing it", async () => {
    const parsed = parseCursors(`{"${KEY_ONE}":{"next":"2026-10-02","refusals":1,"runsWithoutRows":-2}}`);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? [] : parsed.issues).toEqual([expect.stringMatching(/runsWithoutRows/)]);
  });
});

describe("the section the count earns at the threshold", () => {
  /** One run short of the notice. */
  const NEARLY = RUNS_WITHOUT_ROWS_BEFORE_NOTICE - 1;

  it("says nothing until the threshold is reached", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask, routes: TQ, cursors: { [KEY_TQ]: { next: TODAY, refusals: 0, runsWithoutRows: NEARLY - 1 } } });

    expect(summary.cursors[KEY_TQ]?.runsWithoutRows).toBe(NEARLY);
    expect(summary.withoutRows).toEqual([]);
  });

  it("names the combo once the threshold is reached", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask, routes: TQ, cursors: { [KEY_TQ]: { next: TODAY, refusals: 0, runsWithoutRows: NEARLY } } });

    expect(summary.withoutRows).toEqual([{ combo: KEY_TQ, runs: RUNS_WITHOUT_ROWS_BEFORE_NOTICE }]);
  });

  it("keeps it OFF the stale list, because this is not a licence to delete anything", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask, routes: TQ, cursors: { [KEY_TQ]: { next: TODAY, refusals: 0, runsWithoutRows: NEARLY } } });

    expect(summary.stale).toEqual([]);
    // And the run is WHOLE, which is the whole reason this section had to exist. A pinned refusal
    // does not hole the dataset — the train may not run today — so a combo that has been dead for a
    // week straight still exits 0. Nothing but this section says a word about it.
    expect(summary.whole).toBe(true);
  });

  it("prints it as its own section, saying what it is and what it is not", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const printed = summarise(await run({ ask, routes: TQ, cursors: { [KEY_TQ]: { next: TODAY, refusals: 0, runsWithoutRows: NEARLY } } })).join("\n");

    expect(printed).toMatch(new RegExp(`${KEY_TQ}\\s+${RUNS_WITHOUT_ROWS_BEFORE_NOTICE} runs`));
    expect(printed).toMatch(/no rows/i);
    // The line that keeps the two lists apart. Without it an operator reads a second delete list.
    expect(printed).toMatch(/not.{0,40}delete/i);
  });
});
