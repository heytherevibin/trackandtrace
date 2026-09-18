import { describe, expect, it, vi } from "vitest";
import type { PnrDataSource } from "@/services/pnr-source";
import { createFallbackSource } from "@/services/sources/fallback";
import { buildFixtureResult } from "@/services/sources/fixture";
import type { PnrOutcome } from "@/types/domain";

const PNR = "2345678901";

function answering(outcome: PnrOutcome) {
  const check = vi.fn(async () => outcome);
  const source: PnrDataSource = { check };
  return { source, check };
}

function record(label: "railkit" | "rapidapi"): PnrOutcome {
  const built = buildFixtureResult(PNR, new Date("2026-09-17T06:30:00.000Z"));
  if (!built.ok) throw new Error("fixture must build");
  return { ok: true, result: { ...built.result, snapshot: { ...built.result.snapshot, source: label } } };
}

const down: PnrOutcome = { ok: false, code: "SOURCE_UNAVAILABLE", message: "RailKit did not answer in time." };
const noRecord: PnrOutcome = { ok: false, code: "NOT_FOUND", message: "No record." };

describe("createFallbackSource", () => {
  it("answers from the primary when it has a record, without asking the fallback", async () => {
    const primary = answering(record("railkit"));
    const secondary = answering(record("rapidapi"));
    const out = await createFallbackSource(primary.source, secondary.source).check(PNR);
    expect(out.ok && out.result.snapshot.source).toBe("railkit");
    expect(secondary.check).not.toHaveBeenCalled();
  });

  it.each([
    ["no record", noRecord],
    ["an invalid PNR", { ok: false, code: "INVALID", message: "Enter 10 digits." } as PnrOutcome],
    ["our own rate limit", { ok: false, code: "RATE_LIMITED", message: "Slow down.", retryAfter: 5 } as PnrOutcome],
  ])("treats %s from the primary as the answer, never a reason to ask elsewhere", async (_label, outcome) => {
    const primary = answering(outcome);
    const secondary = answering(record("rapidapi"));
    const out = await createFallbackSource(primary.source, secondary.source).check(PNR);
    expect(out).toEqual(outcome);
    expect(secondary.check).not.toHaveBeenCalled();
  });

  it("asks the fallback when the primary is unavailable, and labels the answer with the fallback's source", async () => {
    const primary = answering(down);
    const secondary = answering(record("rapidapi"));
    const out = await createFallbackSource(primary.source, secondary.source).check(PNR);
    expect(secondary.check).toHaveBeenCalledWith(PNR);
    expect(out.ok && out.result.snapshot.source).toBe("rapidapi");
  });

  it("passes on the fallback's no-record answer", async () => {
    const out = await createFallbackSource(answering(down).source, answering(noRecord).source).check(PNR);
    expect(out).toEqual(noRecord);
  });

  it("keeps the primary's explanation when both are unavailable", async () => {
    const secondaryDown: PnrOutcome = { ok: false, code: "SOURCE_UNAVAILABLE", message: "RapidAPI quota used up.", retryAfter: 60 };
    const out = await createFallbackSource(answering(down).source, answering(secondaryDown).source).check(PNR);
    expect(out).toEqual(down);
  });

  it("keeps the primary's explanation if the fallback throws", async () => {
    const throwing: PnrDataSource = {
      check: async () => {
        throw new Error("boom");
      },
    };
    const out = await createFallbackSource(answering(down).source, throwing).check(PNR);
    expect(out).toEqual(down);
  });
});
