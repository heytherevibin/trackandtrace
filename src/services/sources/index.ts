import type { Env } from "@/services/env";
import { messages } from "@/messages";
import { activePnrSource, env, fallbackPnrSource, fixtureAllowed, isThirdPartySource, type ThirdPartySource } from "@/services/env";
import type { AvailabilitySource } from "@/services/availability-source";
import type { PnrDataSource } from "@/services/pnr-source";
import type { RouteSource } from "@/services/route-source";
import type { StationSource } from "@/services/station-source";
import type { TrainRouteSource } from "@/services/train-route-source";
import { providerGuard } from "@/services/shared-store";
import { createFallbackSource } from "./fallback";
import { fixtureSource } from "./fixture";
import { fixtureAvailabilitySource } from "./fixture-availability";
import { fixtureRouteSource } from "./fixture-route";
import { fixtureStationSource } from "./fixture-stations";
import { fixtureTrainRouteSource } from "./fixture-train-route";
import { createGuardedSource } from "./guarded";
import { createLiveSource } from "./live";
import { createRailkitSource } from "./railkit";
import { createRailKitAvailabilitySource } from "./railkit-availability";
import { createRailKitRouteSource } from "./railkit-route";
import { createRailKitStationSource } from "./railkit-stations";
import { createRailKitTrainRouteSource } from "./railkit-train-route";

// Provider registry. The fixture is served only when explicitly requested and
// never in production; the env schema refuses that combination at boot and this
// registry refuses it again at call time, so a bypassed guard still fails closed.
// A third-party source may have a second third-party source behind it, asked only
// while the first is unavailable. There is one provider today, so `fallbackPnrSource`
// always answers null and that composition is never reached; it is kept, with its seam
// and its own tests, for the second provider. See PNR_FALLBACK in services/env.ts.

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

/** No provider key, or sample data refused: the route is unavailable, never an empty list of trains. */
const refusedRouteSource: RouteSource = {
  async check() {
    return { ok: false, code: "SOURCE_UNAVAILABLE", message: messages.source.route.couldNotAnswer };
  },
};

/** And for one train's run, where an empty list would read as a train that calls nowhere. */
const refusedTrainRouteSource: TrainRouteSource = {
  async check() {
    return { ok: false, code: "SOURCE_UNAVAILABLE", message: messages.source.route.couldNotAnswer };
  },
};

/**
 * No provider key, or sample data refused: the picker offers nothing.
 *
 * An EMPTY LIST and not a refusal, unlike every seam above it. Those answer a question the
 * traveller asked; this one is an assistance while they type, and a field that interrupts someone
 * mid-word has made typing worse than the plain code box it replaced.
 */
const emptyStationSource: StationSource = {
  async search() {
    return { ok: true, stations: [] };
  },
  async byCode() {
    return { ok: true, stations: [] };
  },
};

/** The same refusal for availability — and here an empty `days` would read as a sold-out train. */
const refusedAvailabilitySource: AvailabilitySource = {
  async check() {
    return { ok: false, code: "SOURCE_UNAVAILABLE", message: messages.source.availability.couldNotAnswer };
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
  if (isThirdPartySource(active)) {
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

/**
 * The provider's own adapter, when this deployment holds its key. A second provider adds a branch.
 *
 * **Exhaustive on purpose.** With two providers an unhandled one was impossible to write; with one
 * it is an `if` away. A provider added to `ThirdPartySource` without a branch here would return
 * `null`, which `resolvePnrSource` reads as "no key for it" and answers with the unavailable `live`
 * seam — a new provider that silently never gets asked, with nothing in the logs to say so. The
 * `never` makes that a compile error instead.
 *
 * A missing KEY still returns `null`, because that genuinely is "this deployment cannot use it".
 */
function providerAdapter(source: ThirdPartySource, current: Env): PnrDataSource | null {
  switch (source) {
    case "railkit":
      return current.RAILKIT_API_KEY
        ? createRailkitSource({ key: current.RAILKIT_API_KEY, baseUrl: current.RAILKIT_BASE_URL, timeoutMs: current.RAILKIT_TIMEOUT_MS })
        : null;
    default: {
      const unwired: never = source;
      throw new Error(`no adapter is wired for third-party source ${String(unwired)}`);
    }
  }
}

export function getPnrSource(): PnrDataSource {
  return resolvePnrSource(env());
}

/**
 * Whether what this deployment serves is sample data. Every surface that shows an answer has to be
 * able to say so — the product's standing rule is that a fixture is always labelled — and a client
 * component cannot read the env, so the answer travels with the answer.
 */
export function servingSampleData(current: Env = env()): boolean {
  return current.PNR_SOURCE === "fixture" && fixtureAllowed(current);
}

/**
 * Which trains run between two stations — the seam availability cannot be asked without.
 *
 * It follows `resolvePnrSource`'s rules rather than inventing its own: the fixture only when it is
 * chosen AND allowed, the provider's adapter behind the same breaker and usage counter, and a
 * deployment with no key answering "unavailable" instead of pretending the route is empty. Its own
 * guard key ("route") keeps a route outage off the PNR fuse, the way the crawler's does.
 */
export function resolveRouteSource(current: Env = env()): RouteSource {
  if (current.PNR_SOURCE === "fixture") return fixtureAllowed(current) ? fixtureRouteSource : refusedRouteSource;
  const active = activePnrSource(current);
  if (!isThirdPartySource(active) || !current.RAILKIT_API_KEY) return refusedRouteSource;
  const adapter = createRailKitRouteSource({ key: current.RAILKIT_API_KEY, baseUrl: current.RAILKIT_BASE_URL, timeoutMs: current.RAILKIT_TIMEOUT_MS });
  return createGuardedSource(adapter, providerGuard(active, "route", current));
}

export function getRouteSource(): RouteSource {
  return resolveRouteSource(env());
}

/**
 * One train's whole run, by the same rules as the route seam above.
 *
 * It shares the **"route"** guard key with the trains-on-a-pair lookup, because both are timetable
 * questions and a timetable outage is one outage. Neither may rest live PNR checks.
 */
export function resolveTrainRouteSource(current: Env = env()): TrainRouteSource {
  if (current.PNR_SOURCE === "fixture") return fixtureAllowed(current) ? fixtureTrainRouteSource : refusedTrainRouteSource;
  const active = activePnrSource(current);
  if (!isThirdPartySource(active) || !current.RAILKIT_API_KEY) return refusedTrainRouteSource;
  const adapter = createRailKitTrainRouteSource({ key: current.RAILKIT_API_KEY, baseUrl: current.RAILKIT_BASE_URL, timeoutMs: current.RAILKIT_TIMEOUT_MS });
  return createGuardedSource(adapter, providerGuard(active, "route", current));
}

/**
 * The station directory, by the same rules again.
 *
 * A deployment with no key answers an EMPTY list rather than a refusal: the picker is an
 * assistance, and a field that interrupts someone mid-word has made typing worse. They can still
 * type the code, which is what they did before this existed.
 */
export function resolveStationSource(current: Env = env()): StationSource {
  if (current.PNR_SOURCE === "fixture") return fixtureAllowed(current) ? fixtureStationSource : emptyStationSource;
  const active = activePnrSource(current);
  if (!isThirdPartySource(active) || !current.RAILKIT_API_KEY) return emptyStationSource;
  // Not behind `createGuardedSource`: that wraps a one-method `check` seam, and this one has two.
  // The exposure it would guard against is bounded elsewhere — a station list is held for a WEEK,
  // every failure answers an empty list rather than retrying, and the per-address limiter caps what
  // one typist can spend. If that stops being true, this needs its own breaker before it needs
  // anything else.
  return createRailKitStationSource({ key: current.RAILKIT_API_KEY, baseUrl: current.RAILKIT_BASE_URL, timeoutMs: current.RAILKIT_TIMEOUT_MS });
}

export function getStationSource(): StationSource {
  return resolveStationSource(env());
}

export function getTrainRouteSource(): TrainRouteSource {
  return resolveTrainRouteSource(env());
}

/**
 * Seat availability for one journey, by the same rules as the route seam above: the fixture only
 * when it is chosen AND allowed, the provider's adapter behind its own breaker and usage counter,
 * and a deployment with no key answering "we could not ask".
 *
 * That last branch matters more here than anywhere else in this file. The one shape this seam must
 * never produce is an empty day list, because a traveller reads it as "no berths" and acts on it.
 */
export function resolveAvailabilitySource(current: Env = env()): AvailabilitySource {
  if (current.PNR_SOURCE === "fixture") return fixtureAllowed(current) ? fixtureAvailabilitySource : refusedAvailabilitySource;
  const active = activePnrSource(current);
  if (!isThirdPartySource(active) || !current.RAILKIT_API_KEY) return refusedAvailabilitySource;
  const adapter = createRailKitAvailabilitySource({ key: current.RAILKIT_API_KEY, baseUrl: current.RAILKIT_BASE_URL, timeoutMs: current.RAILKIT_TIMEOUT_MS });
  return createGuardedSource(adapter, providerGuard(active, "availability", current));
}

export function getAvailabilitySource(): AvailabilitySource {
  return resolveAvailabilitySource(env());
}
