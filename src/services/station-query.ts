import type { Kv } from "./kv";
import { log } from "./log";
import { addressKey, type RateLimiter } from "./rate-limit";
import { createRateLimiter, publicStore } from "./shared-store";
import { getStationSource } from "./sources";
import type { Station, StationSource } from "./station-source";

// ---------------------------------------------------------------------------
// Finding a station, cached, with the two lookups merged.
//
// The provider's search matches NAMES only: "SBC" returns nothing and "MAS"
// returns ten stations that are not MAS. So a code-shaped query is resolved
// exactly as well, and that answer LEADS — a reader who typed the code they
// already know must get it first, not buried under substring matches.
//
// Typing produces queries faster than any other surface in this product, so the
// cache is doing more work here than anywhere else. Station names do not change,
// which is what justifies holding them for a week.
// ---------------------------------------------------------------------------

/** The provider refuses anything shorter, and a one-letter query would match half the country anyway. */
export const STATION_MIN_QUERY = 2;
/** Enough to scan without scrolling. The provider returns at most ten. */
export const STATION_MAX_RESULTS = 8;
/** Typing is bursty: a reader filling two fields can easily produce a dozen queries in a minute. */
export const STATION_RATE_LIMIT = { limit: 40, windowMs: 60_000 };
/** A week. Station names do not change; the code-to-name mapping is as stable as anything here. */
export const STATION_TTL_MS = 604_800_000;

/** Two to five letters is what a station code looks like, and what the form has always accepted. */
const CODE = /^[A-Za-z]{2,5}$/;

export interface StationQueryDeps {
  readonly limiter: RateLimiter;
  readonly source: StationSource;
  readonly kv: Kv;
  readonly prefix: string;
}

let shared: Pick<StationQueryDeps, "limiter"> | null = null;

function deps(): StationQueryDeps {
  shared ??= { limiter: createRateLimiter() };
  const store = publicStore();
  return { ...shared, source: getStationSource(), kv: store.kv, prefix: store.prefix };
}

export interface StationQueryResult {
  readonly stations: readonly Station[];
  readonly cached: boolean;
}

/** Collapsed whitespace and lower case, so "  New  Delhi " and "new delhi" are one cache entry. */
function normalise(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function fromJson(raw: string | null): readonly Station[] | undefined {
  if (raw === null) return undefined;
  try {
    const value = JSON.parse(raw) as readonly Station[];
    return Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** The exact code first, then the name matches, with no station twice. */
function merge(exact: readonly Station[], byName: readonly Station[]): readonly Station[] {
  const seen = new Set(exact.map((s) => s.code));
  const out = [...exact];
  for (const station of byName) {
    if (seen.has(station.code)) continue;
    seen.add(station.code);
    out.push(station);
  }
  return out.slice(0, STATION_MAX_RESULTS);
}

export async function queryStations(query: string, ip: string, overrides: Partial<StationQueryDeps> = {}): Promise<StationQueryResult> {
  const { limiter, source, kv, prefix } = { ...deps(), ...overrides };
  const asked = normalise(query);
  // Too short to ask about. Not a refusal — there is simply nothing to look up yet.
  if (asked.length < STATION_MIN_QUERY) return { stations: [], cached: false };

  const key = `${prefix}:stations:${asked}`;
  // Read before the limiter, as the train route does: a cached list costs the provider nothing, so
  // rationing it would only punish a reader for someone else's typing.
  const hit = await kv.get(key).then(fromJson, (error: unknown) => {
    log.warn("[stations] cache read failed", { kind: error instanceof Error ? error.name : typeof error });
    return undefined;
  });
  if (hit) return { stations: hit, cached: true };

  const rate = await limiter.check(`stations:${addressKey(ip)}`, STATION_RATE_LIMIT.limit, STATION_RATE_LIMIT.windowMs);
  if (!rate.ok) return { stations: [], cached: false };

  // Both at once. The code lookup is skipped entirely for a query that is not code-shaped, so an
  // ordinary name search still costs exactly one request.
  const [byName, exact] = await Promise.all([
    source.search(asked),
    CODE.test(asked) ? source.byCode(asked.toUpperCase()) : Promise.resolve({ ok: true as const, stations: [] }),
  ]);

  // A failure on either side is not an error the field shows. An autocomplete that interrupts
  // someone mid-word has made typing worse; it simply offers nothing and lets them type the code.
  const stations = merge(exact.ok ? exact.stations : [], byName.ok ? byName.stations : []);
  if (stations.length > 0) {
    void Promise.resolve(kv.set(key, JSON.stringify(stations), STATION_TTL_MS)).catch((error: unknown) => {
      log.warn("[stations] answer served but not cached", { kind: error instanceof Error ? error.name : typeof error });
    });
  }
  return { stations, cached: false };
}
