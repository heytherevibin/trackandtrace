import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AvailabilityAnswer, AvailabilityDayRecord, AvailabilityRequest } from "@/services/availability-source";
import {
  OBSERVATION_CONFLICT_COLUMNS,
  OBSERVATION_TABLE,
  observationRows,
  recordObservations,
  type ObservationDb,
} from "@/services/observations";

const MIGRATION = join(process.cwd(), "supabase/migrations/20260923100000_availability_observations.sql");

// The traveller asked for the 24th; the source answers with a four-date window
// starting there, so three of the four rows are about a date nobody typed.
const request: AvailabilityRequest = {
  trainNo: " 12621 ",
  from: "mas",
  to: " ndls ",
  journeyDate: "2026-09-24",
  travelClass: "sl",
  quota: "gn",
};

function day(over: Partial<AvailabilityDayRecord> = {}): AvailabilityDayRecord {
  return {
    date: "2026-09-24",
    status: "WAITLIST",
    availabilityText: "WL 26",
    rawStatus: "GNWL65/WL26",
    canBook: true,
    wlBooking: 65,
    wlCurrent: 26,
    seats: null,
    prediction: "Confirm Chances",
    predictionPercentage: 70.5,
    ...over,
  };
}

function answer(days: readonly AvailabilityDayRecord[]): AvailabilityAnswer {
  return {
    train: { no: "12621", name: "TN EXPRESS", fromName: "MGR CHENNAI CTL", toName: "NEW DELHI", distanceKm: 2180 },
    fare: { base: 620, reservation: 40, superfast: 45, gst: 0, total: 705 },
    days,
    retrievedAt: "2026-09-23T18:30:00.000Z",
  };
}

type UpsertOptions = { readonly onConflict?: string; readonly ignoreDuplicates?: boolean };
type UpsertCall = { readonly table: string; readonly rows: readonly Record<string, unknown>[]; readonly options: UpsertOptions };

/** Stands in for the secret-key client, and records exactly what was asked of it. */
function fakeDb(result: { error: { message: string } | null } = { error: null }): { db: ObservationDb; calls: UpsertCall[] } {
  const calls: UpsertCall[] = [];
  const db = {
    from(table: string) {
      return {
        upsert(rows: readonly Record<string, unknown>[], options: UpsertOptions) {
          calls.push({ table, rows, options });
          return Promise.resolve(result);
        },
      };
    },
  };
  return { db: db as unknown as ObservationDb, calls };
}

describe("observationRows", () => {
  it("writes one row per returned day, each about its own date", () => {
    const rows = observationRows(request, answer([day({ date: "2026-09-24" }), day({ date: "2026-09-25" }), day({ date: "2026-09-26" }), day({ date: "2026-09-27" })]));
    expect(rows.map((r) => r.journey_date)).toEqual(["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]);
  });

  it("stamps every row with the moment the source answered, not the moment of writing", () => {
    const rows = observationRows(request, answer([day()]));
    expect(rows[0]?.observed_at).toBe("2026-09-23T18:30:00.000Z");
  });

  it("normalises the leg, class and quota so one casing cannot become two observations", () => {
    const rows = observationRows(request, answer([day()]));
    expect(rows[0]).toMatchObject({ train_no: "12621", from_code: "MAS", to_code: "NDLS", travel_class: "SL", quota: "GN" });
  });

  it("keeps the source text verbatim beside the split it was parsed into", () => {
    const rows = observationRows(request, answer([day()]));
    expect(rows[0]).toMatchObject({ status: "WAITLIST", raw_status: "GNWL65/WL26", wl_booking: 65, wl_current: 26 });
  });

  it("records a day with no waitlist pair as nulls, because that is a normal reading", () => {
    const free = day({ status: "AVAILABLE", rawStatus: "AVAILABLE 0042", wlBooking: null, wlCurrent: null, seats: 42 });
    const rows = observationRows(request, answer([free]));
    expect(rows[0]).toMatchObject({ raw_status: "AVAILABLE 0042", wl_booking: null, wl_current: null });
  });

  it("carries the berth count when the day has one, and null when it does not", () => {
    expect(observationRows(request, answer([day({ rawStatus: "AVAILABLE 0042", seats: 42 })]))[0]?.seats).toBe(42);
    expect(observationRows(request, answer([day({ rawStatus: "GNWL65/WL26", seats: null })]))[0]?.seats).toBeNull();
  });

  // The row this column exists for: status says WAITLIST, booking has closed.
  it("records whether booking was open, which status alone never says", () => {
    const closed = day({ status: "WAITLIST", rawStatus: "NOT AVAILABLE", canBook: false, wlBooking: null, wlCurrent: null });
    const rows = observationRows(request, answer([closed]));
    expect(rows[0]).toMatchObject({ status: "WAITLIST", can_book: false });
    expect(observationRows(request, answer([day()]))[0]?.can_book).toBe(true);
  });

  it("records the source's own guess as the baseline to beat", () => {
    const rows = observationRows(request, answer([day()]));
    expect(rows[0]).toMatchObject({ source_prediction: "Confirm Chances", source_prediction_pct: 70.5 });
  });

  // The Supabase type generator lists `days_out` and `observed_on` as ordinary
  // optional insert columns, so the `Omit` in the module is the only
  // compile-time guard and this is the runtime one. `outcome` is excluded for a
  // different reason: an upsert overwrites every column in its payload, so a
  // re-observation later the same day must not be able to wipe a resolved one.
  it("writes neither generated column, nor the field an upsert would clobber", () => {
    const rows = observationRows(request, answer([day()]));
    for (const key of ["id", "days_out", "observed_on", "outcome"]) {
      expect(Object.keys(rows[0] ?? {})).not.toContain(key);
    }
  });

  it("carries nothing that identifies a person", () => {
    const rows = observationRows(request, answer([day()]));
    expect(Object.keys(rows[0] ?? {}).join(" ")).not.toMatch(/pnr|user|passenger|email|phone/i);
  });

  it("drops a day whose date is unusable rather than losing the other three", () => {
    const rows = observationRows(request, answer([day({ date: "24-9-2026" }), day({ date: "2026-09-25" }), day({ date: "2026-09-26" }), day({ date: "2026-09-27" })]));
    expect(rows.map((r) => r.journey_date)).toEqual(["2026-09-25", "2026-09-26", "2026-09-27"]);
  });

  it("collapses a repeated date to its last reading, which the whole statement would otherwise fail on", () => {
    const rows = observationRows(request, answer([day({ wlCurrent: 26 }), day({ wlCurrent: 21 })]));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.wl_current).toBe(21);
  });
});

describe("recordObservations", () => {
  it("returns how many rows it wrote", async () => {
    const { db, calls } = fakeDb();
    await expect(recordObservations(request, answer([day({ date: "2026-09-24" }), day({ date: "2026-09-25" })]), db)).resolves.toBe(2);
    expect(calls[0]?.rows).toHaveLength(2);
  });

  it("writes to the observation table, resolving against the unique index", async () => {
    const { db, calls } = fakeDb();
    await recordObservations(request, answer([day()]), db);
    expect(calls[0]?.table).toBe(OBSERVATION_TABLE);
    expect(calls[0]?.options.onConflict).toBe(OBSERVATION_CONFLICT_COLUMNS);
  });

  it("merges the retried write rather than ignoring it, so the later reading wins", async () => {
    const { db, calls } = fakeDb();
    await recordObservations(request, answer([day()]), db);
    expect(calls[0]?.options.ignoreDuplicates).toBe(false);
  });

  it("loses the observation, never the caller, when the write is refused", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db } = fakeDb({ error: { message: "permission denied for table availability_observations" } });
    await expect(recordObservations(request, answer([day()]), db)).resolves.toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("loses the observation, never the caller, when the client itself throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const exploding = {
      from() {
        throw new Error("fetch failed");
      },
    } as unknown as ObservationDb;
    await expect(recordObservations(request, answer([day()]), exploding)).resolves.toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns 0 rather than throwing when the deployment has no secret key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordObservations(request, answer([day()]))).resolves.toBe(0);
    warn.mockRestore();
  });

  it("does not reach the database at all when no day is usable", async () => {
    const { db, calls } = fakeDb();
    await expect(recordObservations(request, answer([]), db)).resolves.toBe(0);
    expect(calls).toHaveLength(0);
  });
});

// The conflict string and the migration are two statements of one fact, in two
// languages that no compiler checks against each other. A typo would surface
// only in production, as a refused write and a lost observation.
describe("the migration this module writes against", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("has a unique index whose columns are exactly the conflict string", () => {
    const match = /create unique index availability_observations_once_a_day_idx\s+on public\.availability_observations \(([^)]+)\)/.exec(sql);
    expect(match).not.toBeNull();
    expect(match?.[1]?.split(",").map((c) => c.trim()).join(",")).toBe(OBSERVATION_CONFLICT_COLUMNS);
  });

  it("declares no column that identifies a person", () => {
    const body = /create table public\.availability_observations \(([\s\S]+?)\n\);/.exec(sql)?.[1] ?? "";
    const columns = body
      .split("\n")
      .map((line) => line.replace(/--.*$/, "").trim())
      .filter((line) => line !== "")
      .join(" ");
    expect(columns).not.toBe("");
    expect(columns).not.toMatch(/\b(pnr|user_id|passenger|email|phone|mobile|berth|coach)\b/i);
  });

  it("revokes the auto-grant from every Data API role, service role included", () => {
    expect(sql).toMatch(/revoke all on public\.availability_observations from anon, authenticated, service_role;/);
    expect(sql).toMatch(/grant select, insert, update on public\.availability_observations to service_role;/);
  });
});
