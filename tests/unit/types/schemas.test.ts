import { describe, expect, it } from "vitest";
import {
  historyPointSchema,
  pnrApiResponseSchema,
  pnrResultSchema,
  watchlistEntrySchema,
  watchlistUpsertSchema,
} from "@/types/schemas";
import { buildFixtureResult } from "@/services/sources/fixture";

const NOW = new Date("2026-09-17T06:30:00.000Z");

describe("pnrResultSchema", () => {
  it("accepts every fixture outcome that is ok", () => {
    for (const pnr of ["2345678901", "2345678903", "2345678905", "2345678908", "2345678909"]) {
      const outcome = buildFixtureResult(pnr, NOW);
      if (!outcome.ok) throw new Error(`expected ok for ${pnr}`);
      expect(pnrResultSchema.safeParse(outcome.result).success).toBe(true);
    }
  });

  it("rejects an 11-digit pnr inside the snapshot", () => {
    const outcome = buildFixtureResult("2345678901", NOW);
    if (!outcome.ok) throw new Error("expected ok");
    const bad = { ...outcome.result, snapshot: { ...outcome.result.snapshot, pnr: "23456789012" } };
    expect(pnrResultSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown source label", () => {
    const outcome = buildFixtureResult("2345678901", NOW);
    if (!outcome.ok) throw new Error("expected ok");
    const bad = { ...outcome.result, snapshot: { ...outcome.result.snapshot, source: "demo" } };
    expect(pnrResultSchema.safeParse(bad).success).toBe(false);
  });
});

describe("pnrApiResponseSchema", () => {
  it("discriminates the error envelope", () => {
    const parsed = pnrApiResponseSchema.safeParse({ ok: false, code: "SOURCE_UNAVAILABLE", message: "no source" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.ok).toBe(false);
  });

  it("requires the full envelope on success", () => {
    const outcome = buildFixtureResult("2345678901", NOW);
    if (!outcome.ok) throw new Error("expected ok");
    const good = {
      ok: true,
      source: "fixture",
      cached: false,
      latencyMs: 3,
      rate: { remaining: 19, limit: 20 },
      data: outcome.result,
    };
    expect(pnrApiResponseSchema.safeParse(good).success).toBe(true);
    expect(pnrApiResponseSchema.safeParse({ ...good, data: { pnr: "x" } }).success).toBe(false);
  });
});

describe("historyPointSchema", () => {
  it("allows a missing probability", () => {
    expect(historyPointSchema.safeParse({ at: NOW.toISOString(), status: "WL", position: 12 }).success).toBe(true);
  });
});

describe("watchlistUpsertSchema", () => {
  it("caps checks at 40 and requires a label", () => {
    const point = { at: NOW.toISOString(), status: "CNF", position: null };
    const tooMany = { pnr: "2345678901", label: "x", checks: Array.from({ length: 41 }, () => point) };
    expect(watchlistUpsertSchema.safeParse(tooMany).success).toBe(false);
    expect(watchlistUpsertSchema.safeParse({ pnr: "2345678901", label: " ", checks: [] }).success).toBe(false);
    expect(watchlistUpsertSchema.safeParse({ pnr: "2345678901", label: "12951 · BCT→NDLS" }).success).toBe(true);
  });
});

// The format the database actually sends, not the one fixtures are written in. Postgres serialises
// a timestamptz with an offset -- `select to_jsonb(now())` gives
// "2026-09-21T19:10:34.256374+00:00" -- and `watchlist_entries.created_at` reaches the client as
// `addedAt` unchanged. z.iso.datetime()'s default accepts only "Z", so every save answered "The
// service returned a malformed response" while all 1155 tests passed, because every fixture in the
// suite writes the "Z" form by hand.
describe("datetimes the database really produces", () => {
  const entry = (addedAt: string) => ({ pnr: "2345678901", label: "12951 · BCT→NDLS", addedAt, checks: [] });

  it("accepts a Postgres timestamptz, offset and microseconds and all", () => {
    expect(watchlistEntrySchema.safeParse(entry("2026-09-21T19:10:34.256374+00:00")).success).toBe(true);
  });

  it("accepts a non-UTC offset too -- the column is timestamptz, not a promise about the zone", () => {
    expect(watchlistEntrySchema.safeParse(entry("2026-09-22T00:40:34.256374+05:30")).success).toBe(true);
  });

  it("still accepts the Z form every fixture uses, so nothing that worked stops working", () => {
    expect(watchlistEntrySchema.safeParse(entry("2026-09-10T00:00:00.000Z")).success).toBe(true);
  });

  it("still refuses something that is not a datetime at all", () => {
    expect(watchlistEntrySchema.safeParse(entry("2026-09-21 19:10:34+00")).success).toBe(false);
    expect(watchlistEntrySchema.safeParse(entry("yesterday")).success).toBe(false);
  });
});
