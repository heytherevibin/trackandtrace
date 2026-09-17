import { buildFixtureResult } from "@/services/sources/fixture";
import type { PnrResult } from "@/types/domain";

// Deterministic fixture results for the result-surface tests. The clock is pinned
// so retrieval times read the same on every run: 06:30 UTC is 12:00 IST.

export const PINNED_NOW = new Date("2026-09-17T06:30:00.000Z");

export function fixtureResult(pnr: string): PnrResult {
  const outcome = buildFixtureResult(pnr, PINNED_NOW);
  if (!outcome.ok) throw new Error(`fixture ${pnr} has no result`);
  return outcome.result;
}

export function asLive(result: PnrResult): PnrResult {
  return { ...result, snapshot: { ...result.snapshot, source: "live" } };
}
