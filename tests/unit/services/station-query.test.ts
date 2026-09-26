import { describe, expect, it, vi } from "vitest";
import { MemoryKv } from "@/services/kv";
import type { RateLimiter } from "@/services/rate-limit";
import { queryStations, STATION_TTL_MS, type StationQueryDeps } from "@/services/station-query";
import type { Station, StationSource } from "@/services/station-source";

// The merge is why this seam exists. Measured against the provider on 2026-09-26:
//
//     "SBC"  → 0 results          (its name is "Krantivira Sangolli Rayanna (Bengaluru)")
//     "MAS"  → 10 results, NONE of them MAS
//
// The search matches names only. Wired straight to the field it would have made the form worse for
// everyone who already knows the code they want, which is everyone who has used it before.

const IP = "203.0.113.11";
const ALLOW_ALL: RateLimiter = { check: () => ({ ok: true, remaining: 39, retryAfterSeconds: 0 }) };

const SBC: Station = { code: "SBC", name: "Krantivira Sangolli Rayanna (Bengaluru)" };
const SMVB: Station = { code: "SMVB", name: "SMVT Bengaluru" };
const AMSA: Station = { code: "AMSA", name: "AMMASANDRA" };
const MAS: Station = { code: "MAS", name: "Mgr Chennai Ctr" };

function setup(over: Partial<StationQueryDeps> = {}) {
  const calls: string[] = [];
  const source: StationSource = {
    async search(name) {
      calls.push(`search:${name}`);
      // Exactly the provider's behaviour: names only.
      const all = [SBC, SMVB, AMSA, MAS];
      return { ok: true, stations: all.filter((s) => s.name.toLowerCase().includes(name.toLowerCase())) };
    },
    async byCode(code) {
      calls.push(`byCode:${code}`);
      const found = [SBC, SMVB, AMSA, MAS].find((s) => s.code === code);
      return { ok: true, stations: found ? [found] : [] };
    },
  };
  const kv = new MemoryKv();
  return { calls, kv, deps: { limiter: ALLOW_ALL, source, kv, prefix: "tt:test", ...over } satisfies StationQueryDeps };
}

describe("finding a station", () => {
  it("finds the station whose code was typed, which the name search cannot", async () => {
    const { deps } = setup();
    const out = await queryStations("SBC", IP, deps);
    // The whole point. "SBC" matches no station NAME, so without the code lookup this is empty and
    // the field is worse than the plain box it replaced.
    expect(out.stations[0]).toEqual(SBC);
  });

  it("puts the exact code first, ahead of names that merely contain it", async () => {
    const { deps } = setup();
    const out = await queryStations("mas", IP, deps);
    // "mas" is a substring of AMMASANDRA. The station actually called MAS leads anyway.
    expect(out.stations[0]).toEqual(MAS);
    expect(out.stations.map((s) => s.code)).toContain("AMSA");
  });

  it("lists a station once, however many ways it was found", async () => {
    const { deps } = setup();
    const out = await queryStations("smvb", IP, deps);
    expect(out.stations.filter((s) => s.code === "SMVB")).toHaveLength(1);
  });

  it("spends one request on an ordinary name, not two", async () => {
    const { calls, deps } = setup();
    await queryStations("bengaluru", IP, deps);
    // Not code-shaped, so the exact lookup is skipped entirely. Typing a name is the common case
    // and must not cost double.
    expect(calls).toEqual(["search:bengaluru"]);
  });

  it("asks for nothing at all below two characters", async () => {
    const { calls, deps } = setup();
    const out = await queryStations("s", IP, deps);
    expect(out.stations).toEqual([]);
    // The provider refuses one character anyway; asking would spend a request to be told so.
    expect(calls).toEqual([]);
  });

  it("serves a repeat query from the store, for a week", async () => {
    const set = vi.fn(async () => {});
    const kv = Object.assign(new MemoryKv(), { set });
    const { deps } = setup({ kv });
    await queryStations("bengaluru", IP, deps);
    expect(set).toHaveBeenCalledWith("tt:test:stations:bengaluru", expect.any(String), STATION_TTL_MS);
  });

  it("treats spacing and case as the same query, so typing does not miss the cache", async () => {
    const { calls, deps } = setup();
    await queryStations("SMVT  Bengaluru", IP, deps);
    await queryStations("  smvt bengaluru ", IP, deps);
    // Typing produces queries faster than any other surface here; a cache that misses on a stray
    // space would barely work at all.
    expect(calls).toEqual(["search:smvt bengaluru"]);
  });

  it("offers nothing rather than an error when the provider fails", async () => {
    const source: StationSource = {
      async search() {
        return { ok: false, code: "SOURCE_UNAVAILABLE", message: "nope", cause: "server" };
      },
      async byCode() {
        return { ok: false, code: "SOURCE_UNAVAILABLE", message: "nope", cause: "server" };
      },
    };
    const { deps } = setup({ source });
    const out = await queryStations("SBC", IP, deps);
    // An autocomplete that interrupts someone mid-word has made typing worse. They can still type
    // the code, which is what they did before this existed.
    expect(out.stations).toEqual([]);
  });

  it("caches nothing when it found nothing, so a typo is not remembered for a week", async () => {
    const { kv, deps } = setup();
    await queryStations("zzzz", IP, deps);
    expect(await kv.get("tt:test:stations:zzzz")).toBeNull();
  });
});
