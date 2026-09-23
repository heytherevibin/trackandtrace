import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_MAX_CALLS_PER_RUN,
  CALLS_PER_ASK_MAX,
  askDates,
  coveredDates,
  crawlCeiling,
  exitCodeFor,
  loadRouteFile,
  parseRouteFile,
  plannedCalls,
  preflight,
  remainingVerdict,
  runCrawl,
  summarise,
} from "../../../scripts/crawl-plan.mjs";
import { bookingClassSchema, quotaSchema } from "@/types/schemas";

// ---------------------------------------------------------------------------
// `npm run source:crawl` fills the observation store. Its plan — everything in
// `scripts/crawl-plan.mjs` — is four things, and all four are
// load-bearing and testable without a network, so all four are pinned here.
// `scripts/crawl-availability.mjs` is only the wiring around them.
//
//   1. The stride. `/seats` answers the asked date plus the next three, so a
//      sixty-day horizon is fifteen calls, not sixty. One off and the run either
//      pays 25% more quota forever or leaves a four-day hole in every combo that
//      nothing can fill — past dates answer 400.
//   2. The preflight. `guarded.ts` counts a request before the adapter sees it,
//      and the adapter refuses a malformed route locally, so a bad list entry
//      spends quota on a call that never happens. A bad entry must fail here,
//      before anything is spent.
//   3. The gate. A spent plan answers 429; a 429 rests every caller of the
//      provider, including live PNR checks, whose fallback is `none`. So the run
//      must be unable to reach the plan's floor, and must stop — never slow — at
//      its own ceiling.
//   4. The report. A silent partial run is what quietly ruins the dataset, so
//      the summary counts what actually happened and the exit code says whether
//      the run was whole.
//
// No key, no network and no database is touched by anything below.
// ---------------------------------------------------------------------------

const SETS = { classes: bookingClassSchema.options, quotas: quotaSchema.options } as const;

/** A shape the parser accepts, so each test can spoil exactly one field. */
function route(over: Partial<Record<string, string>> = {}) {
  return { trainNo: "12621", from: "MAS", to: "NDLS", travelClass: "SL", quota: "GN", ...over };
}

// ---------------------------------------------------------------------------
// 1. The stride
// ---------------------------------------------------------------------------

describe("askDates", () => {
  it("asks for the start date and every fourth day after it", () => {
    expect(askDates("2026-09-24", 12, 4)).toEqual(["2026-09-24", "2026-09-28", "2026-10-02"]);
  });

  it("makes a sixty-day horizon fifteen calls, not sixty — the whole reason the stride exists", () => {
    expect(askDates("2026-09-24", 60, 4)).toHaveLength(15);
  });

  it("starts at the date it was given and never before it: a past date answers 400 and the day is lost for good", () => {
    expect(askDates("2026-09-24", 60, 4)[0]).toBe("2026-09-24");
  });

  it("crosses a month end and a leap day without drifting", () => {
    expect(askDates("2028-02-26", 8, 4)).toEqual(["2028-02-26", "2028-03-01"]);
  });

  it.each([
    ["a horizon of zero", "2026-09-24", 0, 4],
    ["a negative horizon", "2026-09-24", -1, 4],
    ["a window of zero", "2026-09-24", 60, 0],
    ["a fractional horizon", "2026-09-24", 6.5, 4],
  ])("refuses %s rather than guessing", (_label, start, horizon, window) => {
    expect(() => askDates(start, horizon, window)).toThrow(RangeError);
  });

  it("refuses a date that is not ISO", () => {
    expect(() => askDates("24-09-2026", 60, 4)).toThrow(RangeError);
  });
});

describe("the stride covers the horizon exactly once", () => {
  const HORIZONS = [1, 2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 30, 59, 60, 61, 90];
  const WINDOWS = [1, 2, 3, 4, 5, 7];

  it.each(WINDOWS)("leaves no gap and no repeat at a window of %i days", (window) => {
    for (const horizon of HORIZONS) {
      const asks = askDates("2026-09-24", horizon, window);
      const covered = coveredDates(asks, window);
      const wanted = coveredDates(["2026-09-24"], horizon);

      // No repeat: two asks whose windows overlap pay twice for one day.
      expect(new Set(covered).size, `window ${window}, horizon ${horizon}: a day was asked twice`).toBe(covered.length);
      // No gap: a day the stride skips can never be filled — past dates answer 400.
      for (const day of wanted) expect(covered, `window ${window}, horizon ${horizon}: ${day} was skipped`).toContain(day);
      // One call per window, and not one more: this is the arithmetic an
      // off-by-one breaks invisibly until someone counts the month's bill.
      expect(asks.length, `window ${window}, horizon ${horizon}`).toBe(Math.ceil(horizon / window));
      // Whatever runs past the horizon is less than one window's worth. An
      // off-by-one that adds a whole extra ask shows up here and nowhere else.
      expect(covered.length - wanted.length, `window ${window}, horizon ${horizon}: overshot by a whole window`).toBeLessThan(window);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The route list, and the preflight that must reject a bad one before a
//    single request is spent
// ---------------------------------------------------------------------------

describe("parseRouteFile", () => {
  it("reads the shipped list", () => {
    const parsed = parseRouteFile(loadRouteFile());
    expect(parsed.ok).toBe(true);
  });

  it.each([
    ["not an object", "[]"],
    ["no routes", JSON.stringify({ routes: [] })],
    ["routes that are not an array", JSON.stringify({ routes: {} })],
    ["an entry missing a field", JSON.stringify({ routes: [{ trainNo: "12621", from: "MAS" }] })],
    ["a field that is not a string", JSON.stringify({ routes: [{ ...route(), trainNo: 12621 }] })],
  ])("refuses %s, and says so rather than coercing it", (_label, json) => {
    const parsed = parseRouteFile(json);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it("refuses a file that is not JSON at all", () => {
    expect(parseRouteFile("{").ok).toBe(false);
  });
});

describe("the shipped route list", () => {
  const parsed = parseRouteFile(loadRouteFile());
  if (!parsed.ok) throw new Error(`scripts/routes.json does not parse: ${parsed.issues.join("; ")}`);
  const routes = parsed.routes;

  it("passes its own preflight, so the first run cannot fail on the list we wrote", () => {
    expect(preflight(routes, SETS)).toEqual([]);
  });

  it("carries a comment about its own bias — the list is the model's bias, and that has to be written down", () => {
    expect(loadRouteFile()).toMatch(/bias/i);
  });

  it("is a deliberate spread, not three of the same train", () => {
    expect(new Set(routes.map((r) => r.trainNo)).size).toBeGreaterThanOrEqual(3);
  });

  it("covers at least two classes and both GN and TQ", () => {
    expect(new Set(routes.map((r) => r.travelClass)).size).toBeGreaterThanOrEqual(2);
    const quotas = new Set(routes.map((r) => r.quota));
    expect(quotas).toContain("GN");
    expect(quotas).toContain("TQ");
  });

  it("does not carry 12951, which answered `Unable to process your request` for every class and date tried", () => {
    expect(routes.map((r) => r.trainNo)).not.toContain("12951");
  });
});

describe("preflight", () => {
  it("passes a list the adapter would accept", () => {
    expect(preflight([route()], SETS)).toEqual([]);
  });

  it.each([
    ["a four-digit train number", route({ trainNo: "1262" })],
    ["a train number with a letter", route({ trainNo: "1262A" })],
    ["a station code that is too long", route({ from: "MADRAS" })],
    ["a lower-case station code", route({ to: "ndls" })],
    ["a class the schema does not know", route({ travelClass: "3AC" })],
    ["a quota the schema does not know", route({ quota: "GENERAL" })],
    ["a leg that starts where it ends", route({ from: "MAS", to: "MAS" })],
  ])("fails the run's preflight on %s, rather than its budget", (_label, bad) => {
    const issues = preflight([bad], SETS);
    expect(issues).toHaveLength(1);
    // Named by position, because a list of forty is read by index.
    expect(issues[0]).toMatch(/\b1\b/);
  });

  it("names the same combo listed twice: it would spend the whole horizon again for nothing", () => {
    expect(preflight([route(), route()], SETS)).toHaveLength(1);
  });

  it("names every bad entry, not just the first — one run of the preflight should fix the whole file", () => {
    expect(preflight([route({ trainNo: "1" }), route({ from: "x" }), route({ quota: "NOPE" })], SETS)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 3. The gate. This is the requirement the task turns on.
// ---------------------------------------------------------------------------

describe("crawlCeiling", () => {
  it("is the day's plan less what live checks are allowed to spend", () => {
    expect(crawlCeiling({ dailyAllowance: 333, liveReserve: 300 }).ceiling).toBe(33);
  });

  it("is zero when live checks are allowed the whole plan — and says why", () => {
    const verdict = crawlCeiling({ dailyAllowance: 300, liveReserve: 300 });
    expect(verdict.ceiling).toBe(0);
    expect(verdict.reason).toMatch(/reserve/i);
  });

  it("never goes negative when the reserve is larger than the plan", () => {
    expect(crawlCeiling({ dailyAllowance: 100, liveReserve: 300 }).ceiling).toBe(0);
  });

  it("lets an operator ask for less", () => {
    expect(crawlCeiling({ dailyAllowance: 333, liveReserve: 300, requested: 8 }).ceiling).toBe(8);
  });

  it("does not let an operator ask for more: a ceiling a flag can raise is not a ceiling", () => {
    expect(crawlCeiling({ dailyAllowance: 333, liveReserve: 300, requested: 1000 }).ceiling).toBe(33);
  });

  it("caps an absurd plan at the absolute per-run maximum, so a mistyped flag cannot free the run", () => {
    expect(crawlCeiling({ dailyAllowance: 10_000_000, liveReserve: 0 }).ceiling).toBe(ABSOLUTE_MAX_CALLS_PER_RUN);
  });
});

describe("plannedCalls", () => {
  it("counts the worst case: every combo, every stride, every retry", () => {
    expect(plannedCalls({ combos: 3, asksPerCombo: 15 })).toBe(3 * 15 * CALLS_PER_ASK_MAX);
  });

  it("knows the guard retries a check at most once", () => {
    expect(CALLS_PER_ASK_MAX).toBe(2);
  });
});

describe("remainingVerdict", () => {
  it("stops the run when the provider says its own allowance is down to the floor", () => {
    expect(remainingVerdict("50", 50).stop).toBe(true);
  });

  it("keeps going while the provider says there is room", () => {
    expect(remainingVerdict("540", 50).stop).toBe(false);
  });

  it("does not stop on a header the provider did not send — it cannot gate on what it does not know", () => {
    expect(remainingVerdict(null, 50)).toEqual({ known: false, remaining: null, stop: false });
  });

  it("does not stop on a header it cannot read", () => {
    expect(remainingVerdict("plenty", 50).stop).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. The run itself, and what it reports
// ---------------------------------------------------------------------------

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

describe("runCrawl", () => {
  it("asks once per combo per stride, and records what came back", async () => {
    const { ask, seen } = stubAsk(() => OK);
    const summary = await runCrawl({ routes: TWO, start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 4, ceiling: 100 });

    expect(seen).toHaveLength(4); // two combos × two strides
    expect(summary.asks).toBe(4);
    expect(summary.calls).toBe(4);
    expect(summary.rows).toBe(16);
    expect(summary.combos).toBe(2);
    expect(summary.whole).toBe(true);
  });

  it("asks for the stride's dates, never only the first", async () => {
    const { ask, seen } = stubAsk(() => OK);
    await runCrawl({ routes: [route()], start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 4, ceiling: 100 });
    expect(seen.map((s) => s.request.journeyDate)).toEqual(["2026-09-24", "2026-09-28"]);
  });

  it("counts asks and calls separately, because the gap between them is quota spent on nothing", async () => {
    const { ask } = stubAsk(() => OK, 2);
    const summary = await runCrawl({ routes: [route()], start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 1, ceiling: 100 });
    expect(summary.asks).toBe(2);
    expect(summary.calls).toBe(4);
  });

  it("reports a refused combo and keeps going: one bad entry must not cost the rest of the list", async () => {
    const { ask } = stubAsk((n) => (n < 2 ? REFUSED : OK));
    const summary = await runCrawl({ routes: TWO, start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 4, ceiling: 100 });

    expect(summary.asks).toBe(4);
    expect(summary.rows).toBe(8); // only the second combo's two strides were answers
    expect(summary.failures).toHaveLength(2);
    expect(summary.failures[0]?.why).toMatch(/could not answer/);
    expect(summary.whole).toBe(false);
  });

  it("names a combo that refused on every stride as a bad list entry, not a transient failure", async () => {
    const { ask } = stubAsk((n) => (n < 2 ? INVALID : OK));
    const summary = await runCrawl({ routes: TWO, start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 4, ceiling: 100 });

    expect(summary.alwaysRefused).toEqual(["12621 MAS-NDLS SL/GN"]);
  });

  it("does not call a combo a bad entry when the provider answered and only the store refused", async () => {
    // Otherwise a store fault of ours reads as a bad route list, and an operator deletes good routes
    // over it. The failure is still reported — it is just not blamed on the train.
    const { ask } = stubAsk(() => OK);
    const summary = await runCrawl({ routes: TWO, start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 0, ceiling: 100 });

    expect(summary.alwaysRefused).toEqual([]);
    expect(summary.failures).toHaveLength(4);
    expect(summary.failures[0]?.code).toBe("NOT_RECORDED");
  });

  it("does not call a combo a bad entry when it answered even once", async () => {
    const { ask } = stubAsk((n) => (n === 0 ? REFUSED : OK));
    const summary = await runCrawl({ routes: TWO, start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 4, ceiling: 100 });
    expect(summary.alwaysRefused).toEqual([]);
  });

  it("stops at its ceiling rather than slowing down, and says it stopped", async () => {
    const { ask, seen } = stubAsk(() => OK, 2);
    // Four asks are planned; the ceiling leaves room for two at two calls each.
    const summary = await runCrawl({ routes: TWO, start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 4, ceiling: 4, callsPerAsk: 2 });

    expect(seen).toHaveLength(2);
    expect(summary.calls).toBe(4);
    expect(summary.stopped).toMatch(/ceiling/i);
    expect(summary.whole).toBe(false);
  });

  it("never begins an ask that could carry it past the ceiling", async () => {
    const { ask, seen } = stubAsk(() => OK, 2);
    const summary = await runCrawl({ routes: TWO, start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 4, ceiling: 3, callsPerAsk: 2 });
    expect(seen).toHaveLength(1);
    expect(summary.calls).toBe(2);
  });

  it("asks nothing at all when the ceiling is zero", async () => {
    const { ask, seen } = stubAsk(() => OK);
    const summary = await runCrawl({ routes: TWO, start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 4, ceiling: 0 });
    expect(seen).toHaveLength(0);
    expect(summary.calls).toBe(0);
    expect(summary.whole).toBe(false);
  });

  it("stops when the provider's own RateLimit-Remaining reaches the floor", async () => {
    const { ask, seen } = stubAsk(() => OK, 1, "10");
    const summary = await runCrawl({ routes: TWO, start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 4, ceiling: 100, remainingFloor: 50 });

    expect(seen).toHaveLength(1);
    expect(summary.stopped).toMatch(/remaining/i);
    expect(summary.remaining).toBe(10);
    expect(summary.whole).toBe(false);
  });

  it("remembers the last RateLimit-Remaining the provider sent, so the operator can read what the run cost", async () => {
    const { ask } = stubAsk(() => OK, 1, "512");
    const summary = await runCrawl({ routes: [route()], start: "2026-09-24", horizonDays: 4, windowDays: 4, ask, record: async () => 4, ceiling: 100 });
    expect(summary.remaining).toBe(512);
  });

  it("counts rows the store actually wrote, not rows it was handed", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await runCrawl({ routes: [route()], start: "2026-09-24", horizonDays: 4, windowDays: 4, ask, record: async () => 0, ceiling: 100 });
    expect(summary.rows).toBe(0);
    // A store that refused the write is a failure of the run, not a silent zero.
    expect(summary.whole).toBe(false);
  });
});

describe("summarise", () => {
  it("prints asks, calls, rows and the combos attempted", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await runCrawl({ routes: TWO, start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 4, ceiling: 100 });
    const text = summarise(summary).join("\n");

    expect(text).toMatch(/combos attempted\s+2/);
    expect(text).toMatch(/asks\s+4/);
    expect(text).toMatch(/calls made\s+4/);
    expect(text).toMatch(/rows written\s+16/);
  });

  it("names every failed combo and why, because a silent partial run is what ruins the dataset", async () => {
    const { ask } = stubAsk((n) => (n < 2 ? REFUSED : OK));
    const summary = await runCrawl({ routes: TWO, start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 4, ceiling: 100 });
    const text = summarise(summary).join("\n");

    expect(text).toContain("12621 MAS-NDLS SL/GN");
    expect(text).toContain("2026-09-24");
    expect(text).toMatch(/could not answer/);
  });

  it("says plainly when the run was not whole", async () => {
    const { ask } = stubAsk(() => REFUSED);
    const summary = await runCrawl({ routes: [route()], start: "2026-09-24", horizonDays: 4, windowDays: 4, ask, record: async () => 4, ceiling: 100 });
    expect(summarise(summary).join("\n")).toMatch(/not whole|incomplete|hole/i);
  });
});

describe("exitCodeFor", () => {
  it("is zero only when every combo answered and nothing stopped the run", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await runCrawl({ routes: TWO, start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 4, ceiling: 100 });
    expect(exitCodeFor(summary)).toBe(0);
  });

  it("is non-zero when a combo failed, so an operator reading only the exit code still learns of the hole", async () => {
    const { ask } = stubAsk((n) => (n === 0 ? REFUSED : OK));
    const summary = await runCrawl({ routes: TWO, start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 4, ceiling: 100 });
    expect(exitCodeFor(summary)).toBe(1);
  });

  it("is non-zero when the run stopped at a gate", async () => {
    const { ask } = stubAsk(() => OK);
    const summary = await runCrawl({ routes: TWO, start: "2026-09-24", horizonDays: 8, windowDays: 4, ask, record: async () => 4, ceiling: 2, callsPerAsk: 1 });
    expect(exitCodeFor(summary)).toBe(1);
  });
});
