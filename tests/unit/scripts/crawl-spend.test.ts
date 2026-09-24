import { describe, expect, it } from "vitest";
import type { Breaker, Recordable } from "@/services/breaker";
import { createGuardedSource } from "@/services/sources/guarded";
import { unavailable } from "@/services/sources/outcome";
import { createCountingFetch, createDayGate, mayRun } from "../../../scripts/crawl-spend.mjs";
import { runCrawl } from "../../../scripts/crawl-run.mjs";

// ---------------------------------------------------------------------------
// GATE C, WHERE IT IS ACTUALLY ENFORCED.
//
// Every test this branch shipped first proved a pure function returns the right
// number, and not one of them proved a caller does anything with it: the charge,
// the fail-closed refusal and the day's ceiling could each be deleted from
// `crawl-availability.mjs` and all 2262 tests stayed green. That runner has no
// test file and `countingFetch` was a closure inside a 230-line `main()`.
//
// So the three decisions moved into `scripts/crawl-spend.mjs`, which is driven
// here without a network, a database or a clock. What each test pins is the
// deletion it is meant to catch, named in its own comment.
// ---------------------------------------------------------------------------

type Charge = { readonly ok: true } | { readonly ok: false; readonly reason: string };
type Spend = { readonly ok: true; readonly calls: number } | { readonly ok: false; readonly reason: string };

/** All `createGuardedSource` needs back: `Recordable` is `{ ok: true }` or a failure. */
const ANSWERED = { ok: true } as const;
/** What `runCrawl` needs back, which carries the rows `record` is then handed. */
const ROWS = { ok: true as const, answer: { days: [] } };

/** A response with no RateLimit header, which is all most of these tests need back. */
const response = (remaining?: string) => new Response(null, { headers: remaining === undefined ? {} : { "ratelimit-remaining": remaining } });

function route(over: Partial<Record<string, string>> = {}) {
  return { trainNo: "12621", from: "MAS", to: "NDLS", travelClass: "SL", quota: "GN", ...over };
}

describe("createCountingFetch", () => {
  // DELETION 1: `await record(...)` before the fetch. Without it nothing is ever
  // charged, `readCallsToday` answers 0 for ever and the day's gate never binds.
  it("charges the ledger BEFORE the call leaves, because a call counted afterwards is lost exactly when the process dies", async () => {
    const order: string[] = [];
    const counter = createCountingFetch({
      record: async () => {
        order.push("record");
        return { ok: true };
      },
      fetch: async () => {
        order.push("fetch");
        return response();
      },
    });

    await counter.fetch("https://provider.invalid/ask", {});

    expect(order).toEqual(["record", "fetch"]);
  });

  // DELETION 2: `if (!charged.ok) throw`. Without it a call that could not be
  // counted is made anyway — the one call the next run will never know about.
  it("gives the call up when it cannot be charged, rather than sending one nothing can count", async () => {
    let sent = 0;
    const counter = createCountingFetch({
      record: async (): Promise<Charge> => ({ ok: false, reason: "permission denied for table crawler_provider_calls" }),
      fetch: async () => {
        sent += 1;
        return response();
      },
    });

    await expect(counter.fetch("https://provider.invalid/ask", {})).rejects.toThrow(/permission denied/);
    expect(sent).toBe(0);
    expect(counter.calls).toBe(0);
  });

  it("tallies a given-up call, so a run whose asks never left can say why", async () => {
    const counter = createCountingFetch({
      record: async (): Promise<Charge> => ({ ok: false, reason: "the ledger is down" }),
      fetch: async () => response(),
    });

    await expect(counter.fetch("https://provider.invalid/ask", {})).rejects.toThrow();

    expect(counter.uncharged).toBe(1);
  });

  // DELETION 3: the guard's retry (`guarded.ts:65`), or charging once per ask
  // rather than once per call. ONE ask can cost TWO calls, and the ledger has to
  // show both or the day's count under-reports the run that needed it most.
  it("charges the guard's retry too: one ask can cost two calls, and both are on the ledger", async () => {
    const charges: string[] = [];
    let attempts = 0;
    const counter = createCountingFetch({
      record: async (spentAt: string) => {
        charges.push(spentAt);
        return { ok: true };
      },
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("socket hang up");
        return response();
      },
    });
    const adapter = {
      async check(): Promise<Recordable> {
        try {
          await counter.fetch("https://provider.invalid/ask", {});
          return ANSWERED;
        } catch {
          return unavailable("the provider could not be reached", "network");
        }
      },
    };
    const breaker: Breaker = { admit: async () => ({ open: false }), record: async () => {} };
    const guarded = createGuardedSource(adapter, { breaker, countRequest: async () => {}, sleep: async () => {}, random: () => 0.5 });

    await expect(guarded.check(undefined)).resolves.toEqual(ANSWERED);

    expect(charges).toHaveLength(2);
    expect(counter.calls).toBe(2);
  });

  // The belt-and-braces bound costs nothing: it throws BEFORE the charge, so an
  // arithmetic error in the loop cannot inflate the day's ledger.
  it("refuses a third call in one ask without charging for it", async () => {
    const charges: string[] = [];
    const counter = createCountingFetch({
      record: async (spentAt: string) => {
        charges.push(spentAt);
        return { ok: true };
      },
      fetch: async () => response(),
      maxPerAsk: 2,
    });

    await counter.fetch("https://provider.invalid/ask", {});
    await counter.fetch("https://provider.invalid/ask", {});
    await expect(counter.fetch("https://provider.invalid/ask", {})).rejects.toThrow(/per-ask call bound/);

    expect(charges).toHaveLength(2);
  });

  // The hung insert. `recordProviderCall` sat in front of every call with no
  // timeout, so a ledger that accepted the connection and never answered hung the
  // run at its first ask, having printed its banner and nothing else.
  it("bounds the charge with a signal, so a hung ledger cannot hang the run in front of its first call", async () => {
    const seen: (AbortSignal | undefined)[] = [];
    const counter = createCountingFetch({
      record: async (_spentAt: string, options: { readonly signal?: AbortSignal } = {}) => {
        seen.push(options.signal);
        return { ok: true };
      },
      fetch: async () => response(),
      timeoutMs: 30_000,
    });

    await counter.fetch("https://provider.invalid/ask", {});

    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[0]?.aborted).toBe(false);
  });

  it("reads the provider's own RateLimit-Remaining off the response, which is gate B's only input", async () => {
    const counter = createCountingFetch({ record: async () => ({ ok: true }), fetch: async () => response("11") });

    await counter.fetch("https://provider.invalid/ask", {});

    expect(counter.remaining).toBe("11");
  });

  it("starts each ask at zero calls, because `calls` is what the run reports per ask", async () => {
    const counter = createCountingFetch({ record: async () => ({ ok: true }), fetch: async () => response("11") });
    await counter.fetch("https://provider.invalid/ask", {});

    counter.beginAsk();

    expect(counter.calls).toBe(0);
    expect(counter.remaining).toBe(null);
  });
});

const SHIPPED = [route({ trainNo: "12301", from: "HWH", travelClass: "3A" }), route(), route({ trainNo: "12627", from: "SBC", quota: "TQ" })];

const day = (over: Partial<Record<string, number | boolean | string>> = {}) => ({
  ok: true as const,
  ceiling: 33,
  dailyCap: 33,
  spentToday: 0,
  remainingToday: 33,
  limitedByDay: false,
  reason: "33 calls",
  ...over,
});

describe("mayRun", () => {
  // DELETION 4: `if (!day.ok) …`. This is the branch the report called the
  // strongest part of the change and then proved only against `dayCeiling`'s
  // return value — nothing said the run refuses on it.
  it("refuses the run when the day's spend could not be read, rather than starting blind", () => {
    const verdict = mayRun({ day: { ok: false, reason: "the ledger could not be read: connection refused" }, worstCase: 4, routes: SHIPPED });

    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.reason).toMatch(/connection refused/);
  });

  it("carries no ceiling at all when it refuses, so no caller can read one out of it", () => {
    const verdict = mayRun({ day: { ok: false, reason: "no" }, worstCase: 4, routes: SHIPPED });

    expect(Object.hasOwn(verdict, "ceiling")).toBe(false);
  });

  // DELETION 5: `if (worstCase > day.ceiling) …`. Without it the day's ceiling is
  // computed, printed and then ignored, which is the shape the reviewer proved by
  // replacing `day.ceiling` with the run's own.
  it("refuses a run whose worst case is over what is left of today, and names the `--only` that fits", () => {
    const verdict = mayRun({ day: day({ ceiling: 5, spentToday: 28, remainingToday: 5, limitedByDay: true }), worstCase: 10, routes: SHIPPED });

    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.reason).toMatch(/--only 1/);
    expect(!verdict.ok && verdict.reason).toMatch(/[Nn]othing was asked/);
  });

  it("hands back the DAY's ceiling and not the run's own, which is the whole of gate C", () => {
    const verdict = mayRun({ day: day({ ceiling: 5, spentToday: 28, remainingToday: 5, limitedByDay: true }), worstCase: 4, routes: SHIPPED });

    expect(verdict.ok && verdict.ceiling).toBe(5);
  });

  it("lets a run the day can pay for start", () => {
    expect(mayRun({ day: day(), worstCase: 10, routes: SHIPPED }).ok).toBe(true);
  });
});

/** A ledger that answers a different count each time it is read, newest answer last. */
function ledger(answers: readonly Spend[]) {
  const reads: ({ readonly signal?: AbortSignal } | undefined)[] = [];
  const read = async (options?: { readonly signal?: AbortSignal }) => {
    reads.push(options);
    return answers[Math.min(reads.length - 1, answers.length - 1)] as Spend;
  };
  return { read, reads };
}

describe("createDayGate", () => {
  // The concurrency window: the day's count was read ONCE, before planning, so
  // two runs started together both passed the gate and both spent a full run.
  // Every call inserts its row before it leaves, so the ledger is self-correcting
  // — re-reading it before each ask turns a doubled day into one ask's overspend.
  it("lets the next ask through while the day can still cover it", async () => {
    const { read } = ledger([{ ok: true, calls: 10 }]);

    expect(await createDayGate({ read, dailyCap: 33 })()).toBe(null);
  });

  it("stops the run when what is left of the day will not cover the next ask", async () => {
    const { read } = ledger([{ ok: true, calls: 32 }]);

    const stop = await createDayGate({ read, dailyCap: 33, perAsk: 2 })();

    expect(stop).toMatch(/32 of 33/);
  });

  it("re-reads the ledger for EVERY ask, so a run another run overtakes mid-way stops mid-way", async () => {
    const { read, reads } = ledger([
      { ok: true, calls: 10 },
      { ok: true, calls: 33 },
    ]);
    const gate = createDayGate({ read, dailyCap: 33, perAsk: 2 });

    expect(await gate()).toBe(null);
    expect(await gate()).toMatch(/33 of 33/);
    expect(reads).toHaveLength(2);
  });

  it("stops the run when the day's spend can no longer be read, for the reason the start refuses on it", async () => {
    const { read } = ledger([{ ok: false, reason: "the ledger could not be read: connection refused" }]);

    expect(await createDayGate({ read, dailyCap: 33 })()).toMatch(/connection refused/);
  });

  it("bounds its own read, so a hung ledger stops the run rather than hanging it", async () => {
    const { read, reads } = ledger([{ ok: true, calls: 0 }]);

    await createDayGate({ read, dailyCap: 33, timeoutMs: 30_000 })();

    expect(reads[0]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("the day gate, wired into the run", () => {
  it("stops before an ask the day can no longer pay for, and forfeits the rest of the plan", async () => {
    const asked: string[] = [];
    const summary = await runCrawl({
      routes: [route(), route({ trainNo: "12627", from: "SBC" })],
      cursors: {},
      today: "2026-09-24",
      horizonDays: 60,
      windowDays: 4,
      ceiling: 33,
      dayGate: async () => (asked.length === 0 ? null : "today's budget is spent: 33 of 33 calls are charged to it"),
      ask: async (request: { trainNo: string }) => {
        asked.push(request.trainNo);
        return { outcome: ROWS, calls: 2, remaining: null };
      },
      record: async () => 4,
    });

    expect(asked).toEqual(["12621"]);
    expect(summary.stopped).toMatch(/33 of 33/);
    expect(summary.whole).toBe(false);
  });

  it("asks nothing at all when the day is already spent by the time the first ask comes round", async () => {
    let asks = 0;
    const summary = await runCrawl({
      routes: [route()],
      cursors: {},
      today: "2026-09-24",
      horizonDays: 60,
      windowDays: 4,
      ceiling: 33,
      dayGate: async () => "today's budget is spent",
      ask: async () => {
        asks += 1;
        return { outcome: ROWS, calls: 2, remaining: null };
      },
      record: async () => 4,
    });

    expect(asks).toBe(0);
    expect(summary.calls).toBe(0);
  });
});
