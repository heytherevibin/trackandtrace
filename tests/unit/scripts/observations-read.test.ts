import { describe, expect, it } from "vitest";
import { addDays } from "../../../scripts/crawl-window.mjs";
import { readObservations } from "../../../scripts/observations-coverage.mjs";

// ---------------------------------------------------------------------------
// Reading the observation store WHOLE — the one impure edge of `npm run source:report`, split out
// of `observations-coverage.test.ts` when that file crossed 500 lines. Nothing here changed in the
// move: the rule these rows feed, and what that rule cannot see, is `observations-coverage.mjs`'s
// header and the test file beside this one.
//
// Everything below exists for one failure: a store read only in part, reported as a store with
// holes. The rows come back oldest-first, so a truncated read drops the most RECENT days — which
// are exactly the days the report is being run to check. Inventing a `no run on …` for each of them
// would send an operator hunting a crawler outage that never happened.
//
// No key, no network and no database is touched by anything below: the store is a stand-in.
// ---------------------------------------------------------------------------

const COMBO = { train_no: "12051", from_code: "DR", to_code: "MAO", travel_class: "2S", quota: "GN" };

type Page = { data: unknown[] | null; error: { message: string } | null };
type Chain = { select: () => Chain; order: () => Chain; abortSignal: () => Chain; range: (from: number, to: number) => Promise<Page> };

/**
 * A stand-in PostgREST, and the point of it is `serverCap`: PostgREST applies its OWN row cap
 * (Supabase: Settings → API → *Max rows*) on top of what was asked for, so a page shorter than the
 * one requested is NOT proof that the store is exhausted — and a harness that can only return a
 * short page as its LAST page cannot express the failure this read exists to prevent. `failOnAsk`
 * and `nullDataOnAsk` break one numbered request, so a read that dies halfway is representable too.
 */
function fakeStore(rows: readonly unknown[], over: { serverCap?: number; failOnAsk?: number; message?: string; nullDataOnAsk?: number } = {}) {
  const asked: Array<[number, number]> = [];
  const chain: Chain = {
    select: () => chain,
    order: () => chain,
    abortSignal: () => chain,
    range: async (from, to) => {
      asked.push([from, to]);
      if (over.failOnAsk === asked.length) return { data: null, error: { message: over.message ?? "upstream reset" } };
      if (over.nullDataOnAsk === asked.length) return { data: null, error: null };
      return { data: rows.slice(from, from + Math.min(to - from + 1, over.serverCap ?? Number.MAX_SAFE_INTEGER)), error: null };
    },
  };
  return { db: { from: () => chain }, asked };
}

function store(count: number, from = "2026-09-13") {
  return [...Array(count).keys()].map((i) => ({ ...COMBO, journey_date: "2026-10-23", observed_on: addDays(from, i) }));
}

describe("readObservations", () => {
  const rows = store(5);

  // The property, not the stop condition: what comes back is every row the store holds, once each,
  // in the order it holds them. Any loop that satisfies this is a correct loop.
  it("hands back every row the store holds, exactly once and in order", async () => {
    const { db, asked } = fakeStore(rows);
    const read = await readObservations(db, { table: "availability_observations", pageSize: 2 });
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.rows).toEqual(rows);
    expect(new Set(asked.map(String)).size).toBe(asked.length);
  });

  it("reads the store whole when the SERVER caps a page below the page size — a short page is not proof of exhaustion", async () => {
    // 88 rows, a server capped at 40, and the default-sized page asked for. The rows are ordered by
    // `observed_on` ascending, so a read that stopped at the first short page would drop the most
    // recent days — and the report would then invent a `no run on …` for every one of them.
    const many = store(88, "2026-06-28");
    const { db } = fakeStore(many, { serverCap: 40 });
    const read = await readObservations(db, { table: "availability_observations", pageSize: 1000 });
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.rows).toEqual(many);
  });

  it("refuses rather than reporting a store it could only half read", async () => {
    const { db } = fakeStore(rows);
    const read = await readObservations(db, { table: "availability_observations", pageSize: 2, maxRows: 4 });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toMatch(/more rows|too many|truncat/i);
  });

  it("reads a store holding exactly the row limit, rather than refusing one it did read whole", async () => {
    const { db } = fakeStore(rows);
    const read = await readObservations(db, { table: "availability_observations", pageSize: 2, maxRows: 5 });
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.rows).toHaveLength(5);
  });

  it("refuses rather than reading a refusal as an empty store", async () => {
    const { db } = fakeStore(rows, { failOnAsk: 1, message: "permission denied for table availability_observations" });
    const read = await readObservations(db, { table: "availability_observations" });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("permission denied");
  });

  it("refuses when a page fails PARTWAY, and scores none of what it had already read", async () => {
    const { db } = fakeStore(store(6), { failOnAsk: 2 });
    const read = await readObservations(db, { table: "availability_observations", pageSize: 2 });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("upstream reset");
  });

  it("refuses a page that answers without rows at all: unreadable is not empty", async () => {
    const { db } = fakeStore(rows, { nullDataOnAsk: 1 });
    const read = await readObservations(db, { table: "availability_observations" });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toMatch(/without rows|unreadable/i);
  });

  it("refuses a page size of zero rather than asking for nothing and calling the store exhausted", async () => {
    const { db } = fakeStore(rows);
    await expect(readObservations(db, { table: "availability_observations", pageSize: 0 })).rejects.toThrow(/page size/i);
  });

  it("is content with a store that holds nothing", async () => {
    const { db } = fakeStore([]);
    const read = await readObservations(db, { table: "availability_observations" });
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.rows).toEqual([]);
  });
});
