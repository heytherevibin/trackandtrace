import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_MAX_CALLS_PER_RUN,
  CALLS_PER_ASK_MAX,
  REFUSALS_BEFORE_STALE,
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
// `npm run source:crawl` fills the observation store. Three things in its plan are load-bearing,
// and all three are testable without a network, so all three are pinned here. The rolling window
// that decides WHICH date each combo asks for has its own file beside this one;
// `scripts/crawl-availability.mjs` is only the wiring around both.
//
//   1. The preflight. `guarded.ts` counts a request before the adapter sees it, and the adapter
//      refuses a malformed route locally, so a bad list entry spends quota on a call that never
//      happens. A bad entry must fail here, before anything is spent.
//   2. The gate. A spent plan answers 429; a 429 rests every caller of the provider, including
//      live PNR checks, whose fallback is `none`. So the run must be unable to reach the plan's
//      floor, and must stop — never slow — at its own ceiling.
//   3. The report. A silent partial run is what quietly ruins the dataset, so the summary counts
//      what actually happened, each combo's cursor survives the run, and the exit code says
//      whether the run was whole.
//
// No key, no network and no database is touched by anything below.
// ---------------------------------------------------------------------------

const SETS = { classes: bookingClassSchema.options, quotas: quotaSchema.options } as const;

/** A shape the parser accepts, so each test can spoil exactly one field. */
function route(over: Partial<Record<string, string>> = {}) {
  return { trainNo: "12621", from: "MAS", to: "NDLS", travelClass: "SL", quota: "GN", ...over };
}

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
  it("counts the worst case: one ask per combo, and the one retry the guard allows each", () => {
    expect(plannedCalls({ combos: 6 })).toBe(6 * CALLS_PER_ASK_MAX);
  });

  it("knows the guard retries a check at most once", () => {
    expect(CALLS_PER_ASK_MAX).toBe(2);
  });

  it("makes sixteen combos the most a default ceiling of 33 affords, and six comfortable", () => {
    expect(plannedCalls({ combos: 6 })).toBeLessThanOrEqual(crawlCeiling({ dailyAllowance: 333, liveReserve: 300 }).ceiling);
    expect(plannedCalls({ combos: 16 })).toBeLessThanOrEqual(33);
    expect(plannedCalls({ combos: 17 })).toBeGreaterThan(33);
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
  it("asks once per combo per run — not once per stride, which is fifteen times the quota", async () => {
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

    expect(seen.map((s) => s.request.journeyDate)).toEqual(["2026-10-02", TODAY]);
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

  it("counts consecutive refusals ACROSS runs, because one run is now one ask", async () => {
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

describe("summarise", () => {
  it("prints asks, calls, rows and the combos attempted", async () => {
    const { ask } = stubAsk(() => OK);
    const text = summarise(await run({ ask })).join("\n");

    expect(text).toMatch(/combos attempted\s+2/);
    expect(text).toMatch(/asks\s+2/);
    expect(text).toMatch(/calls made\s+2/);
    expect(text).toMatch(/rows written\s+8/);
  });

  it("prints what each combo asked for and how far out it was, so a rolling window can be read at a glance", async () => {
    const { ask } = stubAsk(() => OK);
    const text = summarise(await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: 0 } } })).join("\n");

    expect(text).toContain("2026-10-02");
    expect(text).toMatch(/8 days out/);
  });

  it("names every failed combo and why, because a silent partial run is what ruins the dataset", async () => {
    const { ask } = stubAsk((n) => (n === 0 ? REFUSED : OK));
    const text = summarise(await run({ ask })).join("\n");

    expect(text).toContain(KEY_ONE);
    expect(text).toContain(TODAY);
    expect(text).toMatch(/could not answer/);
  });

  it("says plainly when the run was not whole", async () => {
    const { ask } = stubAsk(() => REFUSED);
    expect(summarise(await run({ ask })).join("\n")).toMatch(/not whole|incomplete|hole/i);
  });
});

describe("exitCodeFor", () => {
  it("is zero only when every combo answered and nothing stopped the run", async () => {
    const { ask } = stubAsk(() => OK);
    expect(exitCodeFor(await run({ ask }))).toBe(0);
  });

  it("is non-zero when a combo failed, so an operator reading only the exit code still learns of the hole", async () => {
    const { ask } = stubAsk((n) => (n === 0 ? REFUSED : OK));
    expect(exitCodeFor(await run({ ask }))).toBe(1);
  });

  it("is non-zero when the run stopped at a gate", async () => {
    const { ask } = stubAsk(() => OK);
    expect(exitCodeFor(await run({ ask, ceiling: 1, callsPerAsk: 1 }))).toBe(1);
  });
});
