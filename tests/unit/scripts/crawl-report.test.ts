import { describe, expect, it } from "vitest";
import { runCrawl } from "../../../scripts/crawl-plan.mjs";
import { exitCodeFor, summarise } from "../../../scripts/crawl-report.mjs";

// ---------------------------------------------------------------------------
// What a run says about itself, and the one number that says it again.
//
// A missed journey date is permanent — a past date answers 400 — so the whole contract of this file
// is that a partial run is LOUD and the exit code agrees with the prose. Two of the cases below were
// added after review found the run claiming "The run was whole" while it had quietly abandoned a
// band of journey dates, and after `--only 0` reported a whole run having asked nothing.
//
// No key, no network and no database is touched by anything below.
// ---------------------------------------------------------------------------

function route(over: Partial<Record<string, string>> = {}) {
  return { trainNo: "12621", from: "MAS", to: "NDLS", travelClass: "SL", quota: "GN", ...over };
}

const OK = { ok: true as const, answer: { days: [] } };
const REFUSED = { ok: false as const, code: "SOURCE_UNAVAILABLE", message: "could not answer", cause: "server" };
/** The guard's own answer while the breaker rests: same code, same shape, and nothing sent. */
const RESTING = { ok: false as const, code: "SOURCE_UNAVAILABLE", message: "resting until the provider recovers", retryAfter: 30 };

type Stubbed = typeof OK | typeof REFUSED | typeof RESTING;

function stubAsk(reply: (n: number) => Stubbed, calls: number | ((n: number) => number) = 1, remaining: string | null = null) {
  let n = 0;
  return async () => {
    const at = n++;
    return { outcome: reply(at), calls: typeof calls === "function" ? calls(at) : calls, remaining };
  };
}

const TWO = [route(), route({ trainNo: "12301", from: "HWH", travelClass: "3A" })];
const TODAY = "2026-09-24";
const KEY_ONE = "12621 MAS-NDLS SL/GN";

type RunParams = Parameters<typeof runCrawl>[0];

function run(over: Partial<RunParams> & Pick<RunParams, "ask">) {
  return runCrawl({ routes: TWO, cursors: {}, today: TODAY, horizonDays: 60, windowDays: 4, record: async () => 4, ceiling: 100, ...over });
}

const text = async (over: Partial<RunParams> & Pick<RunParams, "ask">) => summarise(await run(over)).join("\n");

describe("summarise", () => {
  it("prints asks, calls, rows and the combos attempted", async () => {
    const printed = await text({ ask: stubAsk(() => OK) });

    expect(printed).toMatch(/combos attempted\s+2/);
    expect(printed).toMatch(/asks\s+2/);
    expect(printed).toMatch(/calls made\s+2/);
    expect(printed).toMatch(/rows written\s+8/);
  });

  it("prints what each combo asked for and how far out it was, so a rolling window can be read at a glance", async () => {
    const printed = await text({ ask: stubAsk(() => OK), cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 0 } } });

    expect(printed).toContain("2026-10-02");
    expect(printed).toMatch(/8 days out/);
  });

  it("tells the rolling ask from the pinned one, because only one of them is the outcome row", async () => {
    const printed = await text({ ask: stubAsk(() => OK), cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 0 } } });

    expect(printed).toMatch(/rolling\s+2026-10-02/);
    expect(printed).toMatch(/pinned\s+2026-09-24 \(0 days out\)/);
    expect(printed).toMatch(/outcome row/i);
  });

  it("names every failed combo and why, because a silent partial run is what ruins the dataset", async () => {
    const printed = await text({ ask: stubAsk((n) => (n === 0 ? REFUSED : OK)) });

    expect(printed).toContain(KEY_ONE);
    expect(printed).toContain(TODAY);
    expect(printed).toMatch(/could not answer/);
  });

  it("gives a restarted sweep its own section, naming the combo and the band it gave up", async () => {
    // Five days away is enough: after a fresh run the cursor is only today + one window.
    const printed = await text({ ask: stubAsk(() => OK), today: "2026-11-10", cursors: { [KEY_ONE]: { next: "2026-10-20", refusals: 0 } } });

    expect(printed).toMatch(/RESTARTED/);
    expect(printed).toContain(KEY_ONE);
    expect(printed).toContain("2026-10-20 … 2026-11-09");
    expect(printed).toMatch(/not whole/i);
  });

  it("reports a failed pinned ask apart from the rolling ones, and says what it means", async () => {
    const printed = await text({ ask: stubAsk((n) => (n === 1 ? REFUSED : OK)), cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 0 } } });

    expect(printed).toMatch(/pinned ask at 2026-09-24 did not answer/);
    expect(printed).toMatch(/does not run today/);
    // Normal, so it is not the run's verdict.
    expect(printed).toMatch(/The run was whole/);
  });

  it("gives an ask that never reached the provider its own section, apart from the refusals", async () => {
    const printed = await text({ ask: stubAsk(() => RESTING, 0), cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 0 } } });

    expect(printed).toMatch(/never reached the provider/i);
    expect(printed).toContain("2026-10-02");
    // The cursor holding still is the whole point, so the report says it — and says no strike was
    // taken — rather than leaving the operator to infer either from an unchanged number in a file.
    expect(printed).toMatch(/cursor held where it was|cursor.*did not move/i);
    expect(printed).toMatch(/no refusal strike/i);
    expect(printed).toMatch(/not whole/i);
    // It is NOT the refusal section: a refusal means the band was asked for and comes round again.
    expect(printed).not.toMatch(/did not become rows/);
  });

  it("says plainly when the run was not whole", async () => {
    expect(await text({ ask: stubAsk(() => REFUSED) })).toMatch(/not whole|incomplete|hole/i);
  });

  it("does not call a run that asked nothing whole", async () => {
    expect(await text({ ask: stubAsk(() => OK), routes: [] })).toMatch(/not whole/i);
  });
});

describe("exitCodeFor", () => {
  it("is zero only when every combo answered and nothing stopped the run", async () => {
    expect(exitCodeFor(await run({ ask: stubAsk(() => OK) }))).toBe(0);
  });

  it("is non-zero when a combo failed, so an operator reading only the exit code still learns of the hole", async () => {
    expect(exitCodeFor(await run({ ask: stubAsk((n) => (n === 0 ? REFUSED : OK)) }))).toBe(1);
  });

  it("is non-zero when the run stopped at a gate", async () => {
    expect(exitCodeFor(await run({ ask: stubAsk(() => OK), ceiling: 1, callsPerAsk: 1 }))).toBe(1);
  });

  it("is non-zero when a sweep was restarted, even though every ask answered", async () => {
    const summary = await run({ ask: stubAsk(() => OK), today: "2026-11-10", cursors: { [KEY_ONE]: { next: "2026-10-20", refusals: 0 } } });

    expect(summary.failures).toEqual([]);
    expect(exitCodeFor(summary)).toBe(1);
  });

  it("is non-zero when the list was empty, rather than succeeding loudly at nothing", async () => {
    expect(exitCodeFor(await run({ ask: stubAsk(() => OK), routes: [] }))).toBe(1);
  });
});
