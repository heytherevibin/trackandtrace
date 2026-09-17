import { describe, expect, it } from "vitest";
import {
  historyPointSchema,
  pnrApiResponseSchema,
  pnrResultSchema,
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
