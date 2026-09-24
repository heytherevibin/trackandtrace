import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CRAWLER_CALL_TABLE,
  type CrawlerCallDb,
  dayCeiling,
  readCallsToday,
  recordProviderCall,
  type SpendToday,
} from "@/services/crawler-budget";

const MIGRATION = join(process.cwd(), "supabase/migrations/20260924120000_crawler_provider_calls.sql");

// ---------------------------------------------------------------------------
// The crawler's own daily counter. `crawlCeiling` gates a RUN; nothing gated a
// DAY, so two runs spent twice the ceiling and the second one's spend reached no
// counter anyone would look at (`shared-store.ts` prefixes by environment, and
// with no Upstash credentials the count goes to an in-process Map).
//
// Everything about the arithmetic is pure and proved here without a database.
// The store half is proved against a stub that records exactly what was asked of
// it, because the one thing that must never happen — an unreadable counter that
// lets the run start anyway — is invisible in any test that has a real database
// answering correctly.
// ---------------------------------------------------------------------------

const read = (calls: number): SpendToday => ({ ok: true, calls });

describe("dayCeiling", () => {
  it("takes the smaller of the run's own ceiling and what is left of the day", () => {
    const verdict = dayCeiling({ perRunCeiling: 33, dailyCap: 33, spent: read(28) });

    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.ceiling).toBe(5);
  });

  it("leaves the run's ceiling alone on a day nothing has been spent on", () => {
    const verdict = dayCeiling({ perRunCeiling: 33, dailyCap: 33, spent: read(0) });

    expect(verdict.ok && verdict.ceiling).toBe(33);
    expect(verdict.ok && verdict.limitedByDay).toBe(false);
  });

  it("says which of the two is doing the limiting, because the operator's next move differs", () => {
    const byDay = dayCeiling({ perRunCeiling: 33, dailyCap: 33, spent: read(20) });
    const byRun = dayCeiling({ perRunCeiling: 8, dailyCap: 33, spent: read(0) });

    expect(byDay.ok && byDay.limitedByDay).toBe(true);
    expect(byRun.ok && byRun.limitedByDay).toBe(false);
  });

  it("never goes below zero, however far over the cap a day has gone", () => {
    const verdict = dayCeiling({ perRunCeiling: 33, dailyCap: 33, spent: read(90) });

    expect(verdict.ok && verdict.ceiling).toBe(0);
    expect(verdict.ok && verdict.remainingToday).toBe(0);
  });

  it("reports the day's spend and what is left, which is the number an operator most needs", () => {
    const verdict = dayCeiling({ perRunCeiling: 33, dailyCap: 33, spent: read(14) });

    expect(verdict.ok && verdict.spentToday).toBe(14);
    expect(verdict.ok && verdict.remainingToday).toBe(19);
    expect(verdict.ok && verdict.dailyCap).toBe(33);
  });

  // ---------------------------------------------------------------------------
  // FAIL CLOSED. The whole point of the counter is that a run is measurable; a
  // run that cannot read it is exactly the run this exists to stop.
  // ---------------------------------------------------------------------------
  it("refuses outright when the day's spend could not be read, rather than assuming zero", () => {
    const verdict = dayCeiling({ perRunCeiling: 33, dailyCap: 33, spent: { ok: false, reason: "the store could not be read: connection refused" } });

    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.reason).toMatch(/connection refused/);
  });

  it("carries no ceiling at all on an unreadable count, so no caller can read one out of it", () => {
    const verdict = dayCeiling({ perRunCeiling: 33, dailyCap: 33, spent: { ok: false, reason: "no" } });

    expect(Object.hasOwn(verdict, "ceiling")).toBe(false);
  });
});

type SelectCall = { readonly table: string; readonly columns: string; readonly options: { readonly count?: string }; readonly day: string | null; readonly range: readonly [number, number] | null };
type InsertCall = { readonly table: string; readonly rows: readonly Record<string, unknown>[] };

type Answer = { readonly data: unknown; readonly error: { readonly message: string } | null; readonly count?: number | null };

/** Stands in for the secret-key client, and records exactly what was asked of it. */
function fakeDb(answer: Answer): { db: CrawlerCallDb; selects: SelectCall[]; inserts: InsertCall[] } {
  const selects: SelectCall[] = [];
  const inserts: InsertCall[] = [];
  const db = {
    from(table: string) {
      return {
        select(columns: string, options: { count?: string } = {}) {
          const call: { table: string; columns: string; options: { count?: string }; day: string | null; range: [number, number] | null } = { table, columns, options, day: null, range: null };
          selects.push(call as unknown as SelectCall);
          const chain = {
            eq(_column: string, value: string) {
              call.day = value;
              return chain;
            },
            range(from: number, to: number) {
              call.range = [from, to];
              return Promise.resolve(answer);
            },
          };
          return chain;
        },
        insert(rows: readonly Record<string, unknown>[]) {
          inserts.push({ table, rows });
          return Promise.resolve(answer);
        },
      };
    },
  };
  return { db: db as unknown as CrawlerCallDb, selects, inserts };
}

describe("readCallsToday", () => {
  it("counts the day's rows, because one row is one provider call", async () => {
    const { db, selects } = fakeDb({ data: [], error: null, count: 23 });

    expect(await readCallsToday(db, "2026-09-24")).toEqual({ ok: true, calls: 23 });
    expect(selects[0]?.table).toBe(CRAWLER_CALL_TABLE);
    expect(selects[0]?.day).toBe("2026-09-24");
  });

  it("asks for an exact count and at most one row, never a HEAD request that hides a refusal", async () => {
    const { db, selects } = fakeDb({ data: [], error: null, count: 0 });
    await readCallsToday(db, "2026-09-24");

    expect(selects[0]?.options.count).toBe("exact");
    expect(selects[0]?.range).toEqual([0, 0]);
  });

  it("reads a day nothing was spent on as zero, not as unreadable", async () => {
    const { db } = fakeDb({ data: [], error: null, count: 0 });

    expect(await readCallsToday(db, "2026-09-24")).toEqual({ ok: true, calls: 0 });
  });

  it("is unreadable when the store refuses", async () => {
    const { db } = fakeDb({ data: null, error: { message: "permission denied for table crawler_provider_calls" }, count: null });
    const spend = await readCallsToday(db, "2026-09-24");

    expect(spend.ok).toBe(false);
    expect(!spend.ok && spend.reason).toMatch(/permission denied/);
  });

  // A store that answers without a count is the silent version of the same
  // failure: `count ?? 0` would read an unreadable day as a clean one and free
  // the whole ceiling.
  it("is unreadable when the store answers without a count", async () => {
    const { db } = fakeDb({ data: [], error: null, count: null });

    expect((await readCallsToday(db, "2026-09-24")).ok).toBe(false);
  });

  it("refuses a day that is not an ISO date rather than filtering on nonsense", async () => {
    const { db, selects } = fakeDb({ data: [], error: null, count: 0 });
    const spend = await readCallsToday(db, "24-09-2026");

    expect(spend.ok).toBe(false);
    expect(selects).toEqual([]);
  });

  it("is unreadable when the store throws, which is what an aborted read does", async () => {
    const db = {
      from() {
        throw new Error("fetch failed");
      },
    } as unknown as CrawlerCallDb;

    expect((await readCallsToday(db, "2026-09-24")).ok).toBe(false);
  });
});

describe("recordProviderCall", () => {
  it("writes one row per call into the ledger the count is taken from", async () => {
    const { db, inserts } = fakeDb({ data: null, error: null });

    expect(await recordProviderCall(db, "2026-09-24T09:00:00.000Z")).toEqual({ ok: true });
    expect(inserts[0]?.table).toBe(CRAWLER_CALL_TABLE);
    expect(inserts[0]?.rows).toHaveLength(1);
  });

  // The day is derived in the database from this timestamp, by the same
  // expression `observed_on` uses. Writing it here rather than letting the
  // default fire keeps the counter and the observations on one clock.
  it("stamps the row with the moment the call is about to leave", async () => {
    const { db, inserts } = fakeDb({ data: null, error: null });
    await recordProviderCall(db, "2026-09-24T09:00:00.000Z");

    expect(inserts[0]?.rows[0]).toEqual({ spent_at: "2026-09-24T09:00:00.000Z" });
  });

  it("never writes the generated day, which the database alone may compute", async () => {
    const { db, inserts } = fakeDb({ data: null, error: null });
    await recordProviderCall(db, "2026-09-24T09:00:00.000Z");

    expect(Object.keys(inserts[0]?.rows[0] ?? {})).not.toContain("spent_on");
  });

  it("says so when the write was refused, rather than swallowing a lost call", async () => {
    const { db } = fakeDb({ data: null, error: { message: "permission denied" } });
    const written = await recordProviderCall(db, "2026-09-24T09:00:00.000Z");

    expect(written.ok).toBe(false);
    expect(!written.ok && written.reason).toMatch(/permission denied/);
  });

  it("says so when the write throws", async () => {
    const db = {
      from() {
        throw new Error("fetch failed");
      },
    } as unknown as CrawlerCallDb;

    expect((await recordProviderCall(db, "2026-09-24T09:00:00.000Z")).ok).toBe(false);
  });
});

// The module and the migration are two statements of one fact in two languages
// that no compiler checks against each other. A drifting table name would surface
// only on a real run, as a refused read that then refuses the run itself.
describe("the migration this module counts against", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("creates the table this module reads and writes", () => {
    expect(sql).toContain(`create table public.${CRAWLER_CALL_TABLE} (`);
  });

  it("buckets the day by exactly the expression `observed_on` uses, so the two agree side by side", () => {
    const observations = readFileSync(join(process.cwd(), "supabase/migrations/20260923100000_availability_observations.sql"), "utf8");
    const boundary = /generated always as \(\((\w+) at time zone 'Asia\/Kolkata'\)::date\) stored/;

    expect(boundary.test(observations)).toBe(true);
    expect(boundary.exec(sql)?.[1]).toBe("spent_at");
  });

  it("revokes from service_role too, whose auto-grant includes the delete nothing may hold", () => {
    expect(sql).toMatch(new RegExp(`revoke all on public\\.${CRAWLER_CALL_TABLE} from anon, authenticated, service_role;`));
  });

  it("grants back only select and insert: a spend record that can be changed proves nothing", () => {
    const granted = new RegExp(`grant (.+) on public\\.${CRAWLER_CALL_TABLE} to service_role;`).exec(sql)?.[1];

    expect(granted).toBe("select, insert");
  });

  it("turns row level security on, as the second lock on the same door", () => {
    expect(sql).toContain(`alter table public.${CRAWLER_CALL_TABLE} enable row level security;`);
  });

  it("declares nothing that identifies a person or a journey", () => {
    const body = new RegExp(`create table public\\.${CRAWLER_CALL_TABLE} \\(([\\s\\S]+?)\\n\\);`).exec(sql)?.[1] ?? "";
    const columns = body
      .split("\n")
      .map((line) => line.replace(/--.*$/, "").trim())
      .filter((line) => line !== "")
      .join(" ");

    expect(columns).not.toMatch(/pnr|user|passenger|name|email|phone|address|train|journey/i);
  });
});
