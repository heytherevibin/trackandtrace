import { messages } from "@/messages";
import { log } from "@/services/log";
import type { Station, StationSource, StationsOutcome } from "@/services/station-source";
import { isRecord, text } from "./irctc-record";
import { unavailable } from "./outcome";

// ---------------------------------------------------------------------------
// RailKit as the station directory:
//
//   GET /api/v1/stations/search?name=…   up to 10 by NAME
//   GET /api/v1/stations/:code           exactly one, by code
//
// Both shapes measured 2026-09-26. The search answers
// `{ data: { query, count, stations: [{code, name, lat, lon}] } }`; the lookup
// answers `{ data: {code, name, lat, lon} }` and a 404 for a code it does not
// know — which is an ANSWER ("no such station"), not a provider that failed.
//
// Coordinates are read and dropped: nothing draws a map, and a field the product
// does not use is a field that cannot be wrong.
// ---------------------------------------------------------------------------

export interface RailkitStationsConfig {
  readonly key: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

const OUT = messages.source.outcomes;
const ROUTE = messages.source.route;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function stationOf(value: unknown): Station | null {
  if (!isRecord(value)) return null;
  const code = text(value, ["code", "stnCode", "station_code"])?.toUpperCase();
  const name = text(value, ["name", "stnName", "station_name"]);
  // A station with no code cannot be put in the field it is meant to fill.
  return code && name ? { code, name } : null;
}

export function createRailKitStationSource(config: RailkitStationsConfig, deps: { readonly fetch?: typeof fetch } = {}): StationSource {
  const doFetch = deps.fetch ?? fetch;

  async function get(path: string, label: string): Promise<{ readonly body: unknown; readonly status: number } | StationsOutcome> {
    let response: Response;
    try {
      response = await doFetch(`${config.baseUrl}${path}`, {
        method: "GET",
        cache: "no-store",
        headers: { "x-api-key": config.key, accept: "application/json" },
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      if (isTimeout(error)) {
        log.warn(`[source:railkit-stations] ${label} timed out`, { timeoutMs: config.timeoutMs });
        return unavailable(OUT.timeout, "timeout");
      }
      log.warn(`[source:railkit-stations] ${label} failed`, { kind: error instanceof Error ? error.name : typeof error });
      return unavailable(OUT.unreachable, "network");
    }
    if (response.status === 401 || response.status === 403) {
      log.error("[source:railkit-stations] key or plan refused", { status: response.status });
      return unavailable(OUT.refused, "refused", { status: response.status });
    }
    if (response.status === 429) return unavailable(OUT.busy, "quota", { status: response.status });
    const body = await response.json().catch(() => null);
    return { body, status: response.status };
  }

  return {
    async search(name: string): Promise<StationsOutcome> {
      const got = await get(`/api/v1/stations/search?name=${encodeURIComponent(name)}`, "search");
      if ("ok" in got) return got;
      // The provider refuses a one-character query. That is our own bug if it happens — the caller
      // is meant to hold short queries back — and it is never an outage.
      if (got.status === 400) return { ok: true, stations: [] };
      if (got.status >= 400 || !isRecord(got.body)) return unavailable(ROUTE.couldNotAnswer, "server", { status: got.status });
      const data = isRecord(got.body.data) ? got.body.data : got.body;
      const rows = Array.isArray(data.stations) ? data.stations : [];
      return { ok: true, stations: rows.map(stationOf).filter((s): s is Station => s !== null) };
    },

    async byCode(code: string): Promise<StationsOutcome> {
      const got = await get(`/api/v1/stations/${encodeURIComponent(code)}`, "byCode");
      if ("ok" in got) return got;
      // "No such station" is an ANSWER, and an empty list is how this seam says it. A refusal here
      // would turn every typo into an outage the page has to explain.
      if (got.status === 404 || got.status === 400) return { ok: true, stations: [] };
      if (got.status >= 400 || !isRecord(got.body)) return unavailable(ROUTE.couldNotAnswer, "server", { status: got.status });
      const found = stationOf(isRecord(got.body.data) ? got.body.data : got.body);
      return { ok: true, stations: found ? [found] : [] };
    },
  };
}
