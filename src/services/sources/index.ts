import type { Env } from "@/services/env";
import { activePnrSource, env, fallbackPnrSource, fixtureAllowed, type ThirdPartySource } from "@/services/env";
import type { PnrDataSource } from "@/services/pnr-source";
import { providerGuard } from "@/services/shared-store";
import { createFallbackSource } from "./fallback";
import { fixtureSource } from "./fixture";
import { createGuardedSource } from "./guarded";
import { createLiveSource } from "./live";
import { createRailkitSource } from "./railkit";
import { createRapidApiSource } from "./rapidapi";

// Provider registry. The fixture is served only when explicitly requested and
// never in production; the env schema refuses that combination at boot and this
// registry refuses it again at call time, so a bypassed guard still fails closed.
// A third-party source may have a second third-party source behind it, asked only
// while the first is unavailable.

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
  const active = activePnrSource(current);
  if (active === "railkit" || active === "rapidapi") {
    const primary = thirdPartySource(active, current);
    const fallback = fallbackPnrSource(current);
    return primary && fallback ? withFallback(primary, thirdPartySource(fallback, current)) : (primary ?? createLiveSource(current));
  }
  return createLiveSource(current);
}

function withFallback(primary: PnrDataSource, fallback: PnrDataSource | null): PnrDataSource {
  return fallback ? createFallbackSource(primary, fallback) : primary;
}

/** The provider's adapter behind its breaker, retry policy and usage counter. */
function thirdPartySource(source: ThirdPartySource, current: Env): PnrDataSource | null {
  const adapter = providerAdapter(source, current);
  return adapter ? createGuardedSource(adapter, providerGuard(source, "pnr", current)) : null;
}

function providerAdapter(source: ThirdPartySource, current: Env): PnrDataSource | null {
  if (source === "railkit") {
    return current.RAILKIT_API_KEY
      ? createRailkitSource({ key: current.RAILKIT_API_KEY, baseUrl: current.RAILKIT_BASE_URL, timeoutMs: current.RAILKIT_TIMEOUT_MS })
      : null;
  }
  return current.RAPIDAPI_KEY
    ? createRapidApiSource({ key: current.RAPIDAPI_KEY, host: current.RAPIDAPI_HOST, path: current.RAPIDAPI_PNR_PATH, timeoutMs: current.RAPIDAPI_TIMEOUT_MS })
    : null;
}

export function getPnrSource(): PnrDataSource {
  return resolvePnrSource(env());
}
