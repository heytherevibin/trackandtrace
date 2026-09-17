import type { Env } from "@/services/env";
import { env, fixtureAllowed } from "@/services/env";
import type { PnrDataSource } from "@/services/pnr-source";
import { fixtureSource } from "./fixture";
import { createLiveSource } from "./live";

// Provider registry. The fixture is served only when explicitly requested and
// never in production; the env schema refuses that combination at boot and this
// registry refuses it again at call time, so a bypassed guard still fails closed.

let refusalLogged = false;

const refusedSource: PnrDataSource = {
  async check() {
    return {
      ok: false,
      code: "SOURCE_UNAVAILABLE",
      message: "Sample data is disabled in production. No result was generated.",
    };
  },
};

export function resolvePnrSource(current: Env = env()): PnrDataSource {
  if (current.PNR_SOURCE === "fixture") {
    if (fixtureAllowed(current)) return fixtureSource;
    if (!refusalLogged) {
      refusalLogged = true;
      console.error("[source] PNR_SOURCE=fixture refused: production never serves sample data");
    }
    return refusedSource;
  }
  return createLiveSource(current);
}

export function getPnrSource(): PnrDataSource {
  return resolvePnrSource(env());
}
