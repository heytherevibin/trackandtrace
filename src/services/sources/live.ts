import type { Env } from "@/services/env";
import { env } from "@/services/env";
import type { PnrDataSource } from "@/services/pnr-source";
import type { PnrOutcome } from "@/types/domain";

// Server seam for a verified railway provider. Until an adapter is connected it
// answers with an explicit unavailable outcome and never manufactures a status.

const NOT_CONFIGURED: PnrOutcome = {
  ok: false,
  code: "SOURCE_UNAVAILABLE",
  message: "Verified railway data is not configured for this deployment.",
};

const NOT_CONNECTED: PnrOutcome = {
  ok: false,
  code: "SOURCE_UNAVAILABLE",
  message: "The verified railway provider adapter is not connected. No result was generated.",
};

export function createLiveSource(current: Env): PnrDataSource {
  return {
    async check(): Promise<PnrOutcome> {
      return current.LIVE_SOURCE_ENABLED ? NOT_CONNECTED : NOT_CONFIGURED;
    },
  };
}

export const serverLiveSource: PnrDataSource = {
  check: (pnr) => createLiveSource(env()).check(pnr),
};

export function isLiveSourceConfigured(): boolean {
  return env().LIVE_SOURCE_ENABLED;
}
