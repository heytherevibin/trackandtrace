import { describe, expect, it } from "vitest";
import { REFUSALS_BEFORE_STALE, planAsks, runCrawl } from "../../../scripts/crawl-plan.mjs";

// ---------------------------------------------------------------------------
// The loop that walks the plan and spends the calls. `ask` and `record` are injected, so every case
// below runs without a network or a database.
//
// Three things it must get right, and all three were findings:
//
//   * **The ceiling is reserved BEFORE an ask, never checked after one.** A post-hoc
//     `calls >= ceiling` overshoots by `callsPerAsk - 1` at every ceiling the arithmetic does not
//     divide, and every binding ceiling in the old suite was an exact multiple — the one family of
//     values where the correct gate and the broken one agree.
//   * **Only the ROLLING ask moves the cursor or counts towards staleness.** The pinned ask at today
//     is what supplies the `days_out = 0` outcome row, and it may legitimately refuse because the
//     train does not run today. Counting it would name a Tuesday-only train a bad list entry.
//   * **A run that abandoned a band, or asked nothing at all, is not whole.** Both used to print
//     "The run was whole" and exit 0.
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

type Stubbed = typeof OK | typeof REFUSED | typeof INVALID;
type Asked = { trainNo: string; from: string; to: string; journeyDate: string; travelClass: string; quota: string };

/** Answers every ask the same way, and counts what the run actually asked for. */
function stubAsk(reply: (n: number) => Stubbed, calls = 1, remaining: string | null = null) {
  const seen: { request: Asked }[] = [];
  let n = 0;
  return {
    seen,
    ask: async (request: Asked) => {
      seen.push({ request });
      return { outcome: reply(n++), calls, remaining };
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

describe("runCrawl", () => {
  it("asks per combo, not per stride — a dense sweep would be fifteen times the quota", async () => {
    // No cursors, so the rolling ask IS today and the pinned one is skipped: one ask each.
    const { ask, seen } = stubAsk(() => OK);
    const summary = await run({ ask });

    expect(seen).toHaveLength(2);
    expect(summary.asks).toBe(2);
    expect(summary.calls).toBe(2);
    expect(summary.rows).toBe(8);
    expect(summary.combos).toBe(2);
    expect(summary.whole).toBe(true);
  });

  it("asks today when a combo has no cursor", async () => {
    const { ask, seen } = stubAsk(() => OK);
    await run({ ask });
    expect(seen.map((s) => s.request.journeyDate)).toEqual([TODAY, TODAY]);
  });

  it("asks where each combo's own cursor left off, and moves it on one window", async () => {
    const { ask, seen } = stubAsk(() => OK);
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 0 } } });

    // The middle ask is KEY_ONE's pinned one; KEY_TWO is already at today, so it makes only one.
    expect(seen.map((s) => s.request.journeyDate)).toEqual(["2026-10-02", TODAY, TODAY]);
    expect(summary.cursors[KEY_ONE]).toEqual({ next: "2026-10-06", refusals: 0 });
    expect(summary.cursors[KEY_TWO]).toEqual({ next: "2026-09-28", refusals: 0 });
  });

  it("keeps the cursor of a combo this run did not reach", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await run({ ask, routes: [route()], cursors: { [KEY_TWO]: { next: "2026-11-01", refusals: 2 } } });
    expect(summary.cursors[KEY_TWO]).toEqual({ next: "2026-11-01", refusals: 2 });
  });

  it("names a combo that wrapped back to today", async () => {
    const { ask, seen } = stubAsk(() => OK);
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-12-31", refusals: 0 } } });

    expect(seen[0]?.request.journeyDate).toBe(TODAY);
    expect(summary.wrapped).toEqual([KEY_ONE]);
  });

  it("counts asks and calls separately, because the gap between them is quota spent on nothing", async () => {
    const { ask } = stubAsk(() => OK, 2);
    const summary = await run({ ask });
    expect(summary.asks).toBe(2);
    expect(summary.calls).toBe(4);
  });

  it("reports a refused combo and keeps going: one bad entry must not cost the rest of the list", async () => {
    const { ask } = stubAsk((n) => (n === 0 ? REFUSED : OK));
    const summary = await run({ ask });

    expect(summary.asks).toBe(2);
    expect(summary.rows).toBe(4);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]?.why).toMatch(/could not answer/);
    expect(summary.whole).toBe(false);
  });

  it("advances the cursor even when the ask was refused, so one bad day cannot stall a combo forever", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask });
    // The band comes round again next sweep, at a smaller distance from departure.
    expect(summary.cursors[KEY_ONE]?.next).toBe("2026-09-28");
  });

  it("counts consecutive refusals ACROSS runs, because one run is now one rolling ask", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: TODAY, refusals: 2 } } });
    expect(summary.cursors[KEY_ONE]?.refusals).toBe(3);
  });

  it("forgets the count the moment a combo answers", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: TODAY, refusals: 7 } } });
    expect(summary.cursors[KEY_ONE]?.refusals).toBe(0);
  });

  it("names a combo that has refused enough runs in a row to be a bad list entry", async () => {
    const { ask } = stubAsk((n) => (n === 0 ? INVALID : OK));
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: TODAY, refusals: REFUSALS_BEFORE_STALE - 1 } } });
    expect(summary.stale).toEqual([`${KEY_ONE} (${REFUSALS_BEFORE_STALE} runs in a row)`]);
  });

  it("does not name a combo the store refused to record: that is our fault, not the train's", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await run({ ask, record: async () => 0, cursors: { [KEY_ONE]: { next: TODAY, refusals: REFUSALS_BEFORE_STALE } } });

    expect(summary.stale).toEqual([]);
    expect(summary.failures).toHaveLength(2);
    expect(summary.failures[0]?.code).toBe("NOT_RECORDED");
  });

  it("notes a window that came back shorter than it asked for — normal at Tatkal, worth a look otherwise", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await run({ ask, record: async () => 2 });
    expect(summary.shortWindows).toEqual([
      { combo: KEY_ONE, date: TODAY, days: 2 },
      { combo: KEY_TWO, date: TODAY, days: 2 },
    ]);
  });

  it("notes nothing when the window came back whole", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await run({ ask, record: async () => 4 });
    expect(summary.shortWindows).toEqual([]);
  });

  it("stops at its ceiling rather than slowing down, and says it stopped", async () => {
    const { ask, seen } = stubAsk(() => OK, 2);
    const summary = await run({ ask, ceiling: 2, callsPerAsk: 2 });

    expect(seen).toHaveLength(1);
    expect(summary.calls).toBe(2);
    expect(summary.stopped).toMatch(/ceiling/i);
    expect(summary.whole).toBe(false);
  });

  it("asks nothing at all when the ceiling is zero", async () => {
    const { ask, seen } = stubAsk(() => OK);
    const summary = await run({ ask, ceiling: 0 });
    expect(seen).toHaveLength(0);
    expect(summary.calls).toBe(0);
    expect(summary.whole).toBe(false);
  });

  it("cannot overshoot a ceiling its own arithmetic does not divide — the reservation is made BEFORE the ask", async () => {
    // Every other binding ceiling in this suite is an exact multiple of `callsPerAsk`, which is the
    // one family of values where the correct gate and a naive post-hoc `calls >= ceiling` agree. At
    // ceiling 3 with 2 calls an ask, the naive one asks twice and spends 4.
    const { ask, seen } = stubAsk(() => OK, 2);
    const summary = await run({ ask, ceiling: 3, callsPerAsk: 2 });

    expect(seen).toHaveLength(1);
    expect(summary.calls).toBe(2);
    expect(summary.calls).toBeLessThanOrEqual(3);
    expect(summary.stopped).toMatch(/ceiling/i);
  });

  it("stops when the provider's own RateLimit-Remaining reaches the floor", async () => {
    const { ask, seen } = stubAsk(() => OK, 1, "10");
    const summary = await run({ ask, remainingFloor: 50 });

    expect(seen).toHaveLength(1);
    expect(summary.stopped).toMatch(/remaining/i);
    expect(summary.remaining).toBe(10);
    expect(summary.whole).toBe(false);
  });

  it("remembers the last RateLimit-Remaining the provider sent, so the operator can read what the run cost", async () => {
    const { ask } = stubAsk(() => OK, 1, "512");
    const summary = await run({ ask });
    expect(summary.remaining).toBe(512);
  });

  it("counts rows the store actually wrote, not rows it was handed", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await run({ ask, record: async () => 0 });
    expect(summary.rows).toBe(0);
    expect(summary.whole).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The pinned ask, inside the run: what it must and must not touch
// ---------------------------------------------------------------------------

describe("the pinned ask", () => {
  const AWAY = { [KEY_ONE]: { next: "2026-10-02", refusals: 0 } };

  it("asks today as well as the rolling window, for every combo whose cursor is elsewhere", async () => {
    const { ask, seen } = stubAsk(() => OK);
    const summary = await run({ ask, cursors: AWAY });

    expect(seen.map((s) => s.request.journeyDate)).toEqual(["2026-10-02", TODAY, TODAY]);
    expect(summary.asks).toBe(3);
    expect(summary.planned).toBe(3);
  });

  it("asks once, not twice, on the run a sweep wraps — a duplicate is a wasted call against a very small plan", () => {
    const wrapping = planAsks({ routes: [route()], cursors: { [KEY_ONE]: { next: "2026-12-31", refusals: 0 } }, today: TODAY, horizonDays: 60, windowDays: 4 });

    expect(wrapping).toHaveLength(1);
    expect(wrapping[0]?.kind).toBe("rolling");
    expect(wrapping[0]?.date).toBe(TODAY);
  });

  it("does not move the cursor: the rolling window is unchanged by it", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await run({ ask, cursors: AWAY });
    // One window on from the ROLLING date, not from today.
    expect(summary.cursors[KEY_ONE]).toEqual({ next: "2026-10-06", refusals: 0 });
  });

  it("does not feed the staleness counter: a train that does not run today is not a bad list entry", async () => {
    // The rolling ask answers; only the pinned one refuses.
    const { ask } = stubAsk((n) => (n === 1 ? REFUSED : OK));
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: REFUSALS_BEFORE_STALE - 1 } } });

    expect(summary.cursors[KEY_ONE]?.refusals).toBe(0);
    expect(summary.stale).toEqual([]);
    expect(summary.failures).toEqual([]);
    expect(summary.pinnedFailures).toHaveLength(1);
    expect(summary.pinnedFailures[0]?.date).toBe(TODAY);
  });

  it("does not make the run un-whole when it refuses, because refusing is normal for it", async () => {
    const { ask } = stubAsk((n) => (n === 1 ? REFUSED : OK));
    expect((await run({ ask, cursors: AWAY })).whole).toBe(true);
  });

  it("is still a failure when the provider answered and the store wrote nothing — that is our fault, not the train's", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await run({ ask, cursors: AWAY, record: async () => 0 });

    expect(summary.failures.map((f) => f.code)).toEqual(["NOT_RECORDED", "NOT_RECORDED", "NOT_RECORDED"]);
    expect(summary.whole).toBe(false);
  });

  it("costs calls like any other ask, so the ceiling sees it", async () => {
    const { ask, seen } = stubAsk(() => OK);
    const summary = await run({ ask, cursors: AWAY, ceiling: 2, callsPerAsk: 1 });

    expect(seen).toHaveLength(2);
    expect(summary.stopped).toMatch(/ceiling/i);
  });
});

// ---------------------------------------------------------------------------
// A restarted sweep: the band it gave up is gone, and the run must say so
// ---------------------------------------------------------------------------

describe("a cursor reset", () => {
  it("names the combo and the band the sweep abandoned, and makes the run un-whole", async () => {
    const { ask } = stubAsk(() => OK);
    // Three weeks away — but after a fresh run the cursor is only today + one window, so five days
    // is enough to do this.
    const summary = await run({ ask, today: "2026-11-10", cursors: { [KEY_ONE]: { next: "2026-10-20", refusals: 0 } } });

    expect(summary.restarted).toEqual([{ combo: KEY_ONE, reason: "behind", cursor: "2026-10-20", gaveUp: "2026-10-20 … 2026-11-09" }]);
    expect(summary.failures).toEqual([]);
    expect(summary.whole).toBe(false);
  });

  it("does not confuse a wrap with a restart: a sweep that finished is not a sweep that was abandoned", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-12-31", refusals: 0 } } });

    expect(summary.wrapped).toEqual([KEY_ONE]);
    expect(summary.restarted).toEqual([]);
    expect(summary.whole).toBe(true);
  });

  it("names an unreadable cursor too, and admits it cannot say which band was lost", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "20-10-2026", refusals: 0 } } });

    expect(summary.restarted).toEqual([{ combo: KEY_ONE, reason: "unreadable", cursor: "20-10-2026", gaveUp: null }]);
    expect(summary.whole).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// An empty list did nothing, and said it had done everything
// ---------------------------------------------------------------------------

describe("an empty route list", () => {
  it("is not a whole run: `--only 0`, or any wrapper that computes it and gets 0, must not succeed at nothing", async () => {
    const { ask, seen } = stubAsk(() => OK);
    const summary = await run({ ask, routes: [] });

    expect(seen).toHaveLength(0);
    expect(summary.asks).toBe(0);
    expect(summary.planned).toBe(0);
    expect(summary.whole).toBe(false);
  });
});
