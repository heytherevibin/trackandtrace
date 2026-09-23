import { describe, expect, it } from "vitest";
import { REFUSALS_BEFORE_STALE, runCrawl } from "../../../scripts/crawl-plan.mjs";

// ---------------------------------------------------------------------------
// Split out of `crawl-run.test.ts` when that file crossed the repo's 500-line contract. The rest of
// `runCrawl` -- the ceiling, the cursor, staleness, the pinned ask -- is tested there; this file is
// only the one case below, which is the worst shape a bug takes on this branch and earns the room.
// The helpers are duplicated deliberately: a shared fixture file would make the two suites able to
// break each other, and these are small.
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
/**
 * What `createGuardedSource` answers while the availability breaker is open: the same code a real
 * refusal carries, the provider's own message, and — the only thing that tells them apart —
 * **nothing sent**. Every stub above this line costs a call; this one costs none.
 */
const RESTING = { ok: false as const, code: "SOURCE_UNAVAILABLE", message: "resting until the provider recovers", retryAfter: 30 };

type Stubbed = typeof OK | typeof REFUSED | typeof INVALID | typeof RESTING;
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
// An ask that never reached the provider. THE worst shape a bug takes here.
// ---------------------------------------------------------------------------
// `createGuardedSource` answers a resting breaker with `SOURCE_UNAVAILABLE` and **zero calls** —
// nothing was sent. The loop used to read only `outcome.ok`, so a rest did all three things a real
// refusal does: it advanced the cursor a whole window over journey dates nobody asked for, it put a
// strike against a blameless combo, and three of those name it stale — which the runbook tells the
// operator to delete from `routes.json`.
//
// The band is not recoverable. The next sweep starts 20 days later and the pinned ask only covers
// 0..3, so journey dates 4..19 days out inside a burned band are never asked again, and a past date
// answers 400. It destroys data quietly and then blames the wrong combo.
//
// The rule, in one line: **no call, no judgement.** Nothing left the process, so nothing was
// covered and the provider cannot be judged by it.
// ---------------------------------------------------------------------------

describe("an ask that spent no call", () => {
  const AWAY = { [KEY_ONE]: { next: "2026-10-02", refusals: 0 } };
  /** The first ask rests (nothing sent); everything after it would answer, if the run got there. */
  const restsFirst = () => stubAsk((n) => (n === 0 ? RESTING : OK), (n) => (n === 0 ? 0 : 1));

  it("does not advance the cursor: nothing was asked, so nothing was covered", async () => {
    const { ask } = restsFirst();
    const summary = await run({ ask, cursors: AWAY });
    // Not 2026-10-06. The band 2026-10-02 … 2026-10-05 was never asked for, and the next sweep
    // does not come back for it.
    expect(summary.cursors[KEY_ONE]).toEqual({ next: "2026-10-02", refusals: 0 });
  });

  it("does not add a staleness strike: the provider never saw the request and cannot be judged by it", async () => {
    const { ask } = restsFirst();
    const summary = await run({ ask, cursors: { [KEY_ONE]: { next: "2026-10-02", refusals: REFUSALS_BEFORE_STALE - 1 } } });

    expect(summary.cursors[KEY_ONE]?.refusals).toBe(REFUSALS_BEFORE_STALE - 1);
    expect(summary.stale).toEqual([]);
  });

  it("is its own category, not a refusal, and makes the run un-whole", async () => {
    const { ask } = restsFirst();
    const summary = await run({ ask, cursors: AWAY });

    expect(summary.failures).toEqual([]);
    expect(summary.notAsked).toEqual([{ combo: KEY_ONE, kind: "rolling", date: "2026-10-02", code: "SOURCE_UNAVAILABLE", why: expect.stringMatching(/resting/), rested: true }]);
    expect(summary.whole).toBe(false);
  });

  it("is not counted among the asks that reached the provider", async () => {
    const { ask } = restsFirst();
    const summary = await run({ ask, cursors: AWAY });
    expect(summary.asked).toEqual([]);
    expect(summary.calls).toBe(0);
  });

  it("stops the run: once the fuse is open every remaining ask rests too, so walking the list produces nothing", async () => {
    const { ask, seen } = restsFirst();
    const summary = await run({ ask, cursors: AWAY });

    expect(seen).toHaveLength(1);
    expect(summary.stopped).toMatch(/rest/i);
  });

  it("leaves every combo the run never reached exactly where it was", async () => {
    const { ask } = restsFirst();
    const summary = await run({ ask, cursors: { ...AWAY, [KEY_TWO]: { next: "2026-11-01", refusals: 2 } } });
    expect(summary.cursors[KEY_TWO]).toEqual({ next: "2026-11-01", refusals: 2 });
  });

  it("tells the guard's rest from the adapter refusing a route locally — one is a gate, the other is one bad entry", async () => {
    // `INVALID` before any URL is built also spends no call, and it means the opposite: the route
    // is at fault. It must not stop the rest of the list.
    const { ask, seen } = stubAsk((n) => (n === 0 ? INVALID : OK), (n) => (n === 0 ? 0 : 1));
    const summary = await run({ ask, cursors: AWAY });

    expect(seen).toHaveLength(3);
    expect(summary.stopped).toBeNull();
    expect(summary.notAsked).toHaveLength(1);
    expect(summary.notAsked[0]).toMatchObject({ code: "INVALID", rested: false });
    // Still not covered, so still not advanced.
    expect(summary.cursors[KEY_ONE]?.next).toBe("2026-10-02");
    expect(summary.whole).toBe(false);
  });

  // The rule that decides "gate or bad entry" must fail CLOSED — towards continuing, which costs a
  // wasted walk — and not OPEN, towards stopping the whole run over one route. Stated as
  // "anything that is not INVALID is the gate", a renamed or narrowed adapter code silently flips
  // it, and `Refused.code` is a bare string that nothing binds to the adapter's union.
  it("does not treat an unrecognised zero-call refusal as the gate: one strange route must not stop the list", async () => {
    // What a rename of the adapter's local-refusal code would look like from here. It spends no
    // call and it is NOT the guard's rest, because the guard's rest is the only zero-call outcome
    // in this codebase built without a `cause`.
    const RENAMED = { ok: false as const, code: "BAD_ROUTE", message: "not on this route", cause: "unreadable" };
    const { ask, seen } = stubAsk((n) => (n === 0 ? RENAMED : OK), (n) => (n === 0 ? 0 : 1));
    const summary = await run({ ask, cursors: AWAY });

    expect(seen).toHaveLength(3);
    expect(summary.stopped).toBeNull();
    expect(summary.notAsked[0]).toMatchObject({ code: "BAD_ROUTE", rested: false });
  });

  // Stopping is the right ruling — the fuse is 30 s at minimum and the remaining asks would rest
  // anyway — but it is not free, and the report used to say only "combos attempted 1 of 2". The
  // pinned ask is the ONLY ask that reaches days_out = 0, so a pinned ask the run never made is an
  // outcome row that does not exist and cannot be made to exist later.
  it("names the outcome rows a stop forfeits, because a pinned ask never made is a label lost for good", async () => {
    const { ask } = restsFirst();
    const summary = await run({ ask, cursors: AWAY });

    // Two outcome rows are lost, and only ONE of them is labelled `pinned`: KEY_TWO has no cursor,
    // so its rolling ask already falls on today and `planAsks` emits one merged step rather than
    // two. Counting by `kind` would miss exactly the combos that had just wrapped, which is why the
    // report counts by DATE.
    expect(summary.forfeited.filter((one) => one.date === TODAY)).toHaveLength(2);
    expect(summary.forfeited.filter((one) => one.kind === "pinned")).toHaveLength(1);
    expect(summary.forfeited.map((one) => one.combo)).toContain(KEY_TWO);
  });

  it("holds a pinned ask's ground too, even though a pinned refusal is normally forgiven", async () => {
    // The pinned ask is the second step of KEY_ONE. Refusing it is normal; never sending it is not.
    const { ask } = stubAsk((n) => (n === 1 ? RESTING : OK), (n) => (n === 1 ? 0 : 1));
    const summary = await run({ ask, cursors: AWAY });

    expect(summary.pinnedFailures).toEqual([]);
    expect(summary.notAsked).toHaveLength(1);
    expect(summary.notAsked[0]).toMatchObject({ kind: "pinned", date: TODAY });
    expect(summary.whole).toBe(false);
  });

  it("still advances the cursor when the provider DID see the request and refused it", async () => {
    // The guard against over-correcting: a real refusal is evidence about the date, and the band
    // comes round again next sweep, closer in.
    const { ask } = stubAsk(() => REFUSED);
    const summary = await run({ ask, cursors: AWAY });

    expect(summary.notAsked).toEqual([]);
    expect(summary.cursors[KEY_ONE]).toEqual({ next: "2026-10-06", refusals: 1 });
  });
});
