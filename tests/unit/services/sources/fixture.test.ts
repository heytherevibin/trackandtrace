import { describe, expect, it } from "vitest";
import { buildFixtureResult, fixtureSource } from "@/services/sources/fixture";

const NOW = new Date("2026-09-17T06:30:00.000Z");
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function ok(pnr: string) {
  const outcome = buildFixtureResult(pnr, NOW);
  if (!outcome.ok) throw new Error(`expected ok for ${pnr}, got ${outcome.code}`);
  return outcome.result;
}

describe("buildFixtureResult", () => {
  it("is deterministic for the same PNR and clock", () => {
    expect(buildFixtureResult("2345678901", NOW)).toEqual(buildFixtureResult("2345678901", NOW));
  });

  it("maps the last digit 0-2 to CNF with coach and berth", () => {
    const r = ok("2345678901");
    expect(r.lead.status).toBe("CNF");
    expect(r.lead.position).toBeNull();
    expect(r.lead.coach).toBe("B2");
    expect(r.lead.berth).toBe("19 UB");
    expect(r.snapshot.pax.every((p) => p.currentStatus === "CNF")).toBe(true);
  });

  it("maps the last digit 3-4 to RAC with a position", () => {
    const r = ok("2345678903");
    expect(r.lead.status).toBe("RAC");
    expect(r.lead.position).toBe(1);
  });

  it("maps the last digit 5-7 to WL with quotas GN, PQWL, TQWL", () => {
    expect(ok("2345678905").lead).toMatchObject({ status: "WL", position: 5, quota: "GN" });
    expect(ok("2345678906").lead.quota).toBe("PQWL");
    expect(ok("2345678907").lead.quota).toBe("TQWL");
  });

  it("maps the last digit 8 to CANCELLED", () => {
    expect(ok("2345678908").lead.status).toBe("CANCELLED");
  });

  it("maps the last digit 9 to three passengers CNF, RAC, WL", () => {
    const r = ok("2345678909");
    expect(r.snapshot.passengerCount).toBe(3);
    expect(r.snapshot.pax.map((p) => p.currentStatus)).toEqual(["CNF", "RAC", "WL"]);
  });

  it("returns NOT_FOUND for a PNR ending in 00", () => {
    const outcome = buildFixtureResult("2345678900", NOW);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("NOT_FOUND");
  });

  it("labels the snapshot as fixture and never invents names or predictions", () => {
    const r = ok("2345678901");
    expect(r.snapshot.source).toBe("fixture");
    expect(r.prediction).toBeUndefined();
    expect(r.trend).toBeUndefined();
    expect(r.snapshot.pax.every((p) => p.name === undefined)).toBe(true);
    expect(r.checkedAt).toBe(NOW.toISOString());
  });

  it("places the journey 1-6 days ahead in IST and charts four hours before departure", () => {
    const r = ok("2345678901");
    const istToday = new Date(NOW.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
    const dayDiff = (Date.parse(`${r.snapshot.journeyDate}T00:00:00Z`) - Date.parse(`${istToday}T00:00:00Z`)) / 86_400_000;
    expect(dayDiff).toBeGreaterThanOrEqual(1);
    expect(dayDiff).toBeLessThanOrEqual(6);
    const departure = Date.parse(`${r.snapshot.journeyDate}T${r.snapshot.train.depTime ?? ""}:00+05:30`);
    expect(Date.parse(r.snapshot.chartAt ?? "")).toBe(departure - 4 * 60 * 60 * 1000);
    expect(r.hoursToChart).toBeCloseTo((departure - 4 * 3_600_000 - NOW.getTime()) / 3_600_000, 1);
  });

  it("uses real IR class and quota codes only", () => {
    const classes = new Set(["1A", "2A", "3A", "SL", "CC", "EC", "2S"]);
    const quotas = new Set(["GN", "PQWL", "RLWL", "TQWL", "LD", "TQ"]);
    for (let d = 0; d <= 9; d += 1) {
      const outcome = buildFixtureResult(`234567890${d}`, NOW);
      if (!outcome.ok) continue;
      expect(classes.has(outcome.result.snapshot.cls)).toBe(true);
      expect(quotas.has(outcome.result.lead.quota)).toBe(true);
    }
  });
});

describe("fixtureSource", () => {
  it("implements the PnrDataSource contract", async () => {
    const outcome = await fixtureSource.check("2345678901");
    expect(outcome.ok).toBe(true);
  });
});
