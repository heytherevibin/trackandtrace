import type { Station, StationSource, StationsOutcome } from "@/services/station-source";

// Sample stations, enough to drive the picker end to end.
//
// The names are the REAL ones, including the two that make the feature necessary: SBC is called
// "Krantivira Sangolli Rayanna (Bengaluru)" and MAS is "Mgr Chennai Ctr", so neither is found by
// typing its own code. A fixture whose names matched its codes could not reproduce that, and the
// merge this seam exists for would look like dead code.

const STATIONS: readonly Station[] = [
  { code: "SBC", name: "Krantivira Sangolli Rayanna (Bengaluru)" },
  { code: "SMVB", name: "SMVT Bengaluru" },
  { code: "YPR", name: "Yasvantpur Jn" },
  { code: "MAS", name: "Mgr Chennai Ctr" },
  { code: "MS", name: "Chennai Egmore" },
  { code: "NDLS", name: "New Delhi" },
  { code: "NZM", name: "Hazrat Nizamuddin" },
  { code: "SRR", name: "Shoranur Jn" },
  { code: "MAQ", name: "Mangalore Central" },
];

export const fixtureStationSource: StationSource = {
  async search(name: string): Promise<StationsOutcome> {
    const needle = name.trim().toLowerCase();
    if (needle.length < 2) return { ok: true, stations: [] };
    // NAMES only, exactly as the provider behaves: "SBC" finds nothing here either.
    return { ok: true, stations: STATIONS.filter((s) => s.name.toLowerCase().includes(needle)) };
  },
  async byCode(code: string): Promise<StationsOutcome> {
    const found = STATIONS.find((s) => s.code === code.trim().toUpperCase());
    // No such station is an ANSWER, and an empty list is how this seam says it.
    return { ok: true, stations: found ? [found] : [] };
  },
};
