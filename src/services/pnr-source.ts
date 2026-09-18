import type { PnrOutcome, PnrResult } from "@/types/domain";
import { pnrApiOkSchema } from "@/types/schemas";
import { apiRequest } from "./api-client";
import type { ApiErrorBody } from "./errors";

/**
 * The only data contract consumed by the UI. Implementations must return
 * verified railway data or an explicit unavailable/error outcome. The
 * product does not generate substitute records.
 */
export interface PnrDataSource {
  check(pnr: string): Promise<PnrOutcome>;
}

export interface PnrFetchResult {
  readonly outcome: PnrOutcome;
  readonly cached: boolean;
  readonly latencyMs: number;
}

function outcomeFromError(error: ApiErrorBody): PnrOutcome {
  switch (error.code) {
    case "INVALID_INPUT":
      return { ok: false, code: "INVALID", message: error.message };
    case "NOT_FOUND":
      return { ok: false, code: "NOT_FOUND", message: error.message };
    case "RATE_LIMITED":
      return { ok: false, code: "RATE_LIMITED", message: error.message, retryAfter: error.retryAfter };
    default:
      return { ok: false, code: "SOURCE_UNAVAILABLE", message: error.message };
  }
}

/** Browser fetch of a PNR through the API route, validated against the wire contract. The PNR rides in the body, never the address. */
export async function fetchPnr(pnr: string, options: { readonly fresh?: boolean } = {}): Promise<PnrFetchResult> {
  const body = JSON.stringify(options.fresh ? { pnr, fresh: true } : { pnr });
  const out = await apiRequest("/api/pnr", { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body }, pnrApiOkSchema);
  if (!out.ok) return { outcome: outcomeFromError(out.error), cached: false, latencyMs: 0 };
  return { outcome: { ok: true, result: out.data.data }, cached: out.data.cached, latencyMs: out.data.latencyMs };
}

export const clientPnrSource: PnrDataSource = {
  async check(pnr) {
    return (await fetchPnr(pnr)).outcome;
  },
};

export function isVerifiedLiveResult(outcome: PnrOutcome): outcome is Extract<PnrOutcome, { ok: true }> {
  return outcome.ok && outcome.result.snapshot.source === "live";
}

export type { PnrResult };
