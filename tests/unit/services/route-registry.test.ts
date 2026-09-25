import { afterEach, describe, expect, it } from "vitest";
import { messages } from "@/messages";
import { parseEnv, type Env } from "@/services/env";
import { ROUTE_RATE_LIMIT, queryRoute } from "@/services/route-query";
import { MemoryRateLimiter } from "@/services/rate-limit";
import { resetLocalState } from "@/services/shared-store";
import { fixtureRouteSource } from "@/services/sources/fixture-route";
import { resolveRouteSource } from "@/services/sources";

// ---------------------------------------------------------------------------
// The route seam's wiring: which source a deployment gets, and the limiter in
// front of it. Both exist to keep the same promise in different places — a
// deployment that cannot ask says so, and never answers with an empty route,
// because "no trains run that pair" would send a traveller looking elsewhere.
// ---------------------------------------------------------------------------

const FAKE_KEY = `railkit_${"0123456789abcdef".repeat(2)}`;
const ROUTE = messages.source.route;

afterEach(() => resetLocalState());

function envOf(source: Record<string, string>): Env {
  const parsed = parseEnv(source);
  if (!parsed.ok) throw new Error(parsed.issues.join("; "));
  return parsed.env;
}

describe("resolveRouteSource", () => {
  it("serves sample trains when the fixture is chosen outside production", async () => {
    const out = await resolveRouteSource(envOf({ NODE_ENV: "development", PNR_SOURCE: "fixture" })).check({ from: "SBC", to: "NDLS" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.answer.trains.length).toBeGreaterThan(0);
    expect(out.answer.trains[0]?.trainNo).toMatch(/^\d{5}$/);
  });

  it("answers an unknown pair with an empty list, which is an answer and not a failure", async () => {
    const out = await resolveRouteSource(envOf({ NODE_ENV: "development", PNR_SOURCE: "fixture" })).check({ from: "SBC", to: "XXXX" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.answer.trains).toEqual([]);
  });

  it("refuses sample trains in production even when the env guard is bypassed", async () => {
    const forced: Env = { ...envOf({ NODE_ENV: "development", PNR_SOURCE: "fixture" }), NODE_ENV: "production" };
    const out = await resolveRouteSource(forced).check({ from: "SBC", to: "NDLS" });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
  });

  it("says unavailable, never an empty route, when the deployment holds no key", async () => {
    // The env schema refuses this pairing at boot, so it is forced here: the registry must fail
    // closed a second time for a deployment that reaches call time without a key.
    const keyless: Env = { ...envOf({ NODE_ENV: "development", PNR_SOURCE: "railkit", RAILKIT_API_KEY: FAKE_KEY }), RAILKIT_API_KEY: "" };
    const out = await resolveRouteSource(keyless).check({ from: "SBC", to: "NDLS" });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toBe(ROUTE.couldNotAnswer);
    expect(out).not.toHaveProperty("answer");
  });

  it("wires the provider's adapter when the key is there, not the refusing stand-in", async () => {
    // Told apart without a network: only the real adapter validates the pair itself, and it does so
    // before spending a request. The stand-in answers SOURCE_UNAVAILABLE to everything.
    const wired = await resolveRouteSource(envOf({ NODE_ENV: "development", PNR_SOURCE: "railkit", RAILKIT_API_KEY: FAKE_KEY })).check({ from: "S", to: "NDLS" });
    expect(wired.ok).toBe(false);
    if (wired.ok) return;
    expect(wired.code).toBe("INVALID");
  });
});

describe("queryRoute", () => {
  it("stops asking the provider once a caller is over the limit", async () => {
    const limiter = new MemoryRateLimiter();
    const ip = "203.0.113.7";
    for (let i = 0; i < ROUTE_RATE_LIMIT.limit; i += 1) {
      const out = await queryRoute("SBC", "NDLS", ip, { limiter, source: fixtureRouteSource });
      expect(out.outcome.ok).toBe(true);
    }
    const limited = await queryRoute("SBC", "NDLS", ip, { limiter, source: fixtureRouteSource });
    expect(limited.outcome.ok).toBe(false);
    if (limited.outcome.ok) return;
    expect(limited.outcome.code).toBe("RATE_LIMITED");
    expect(limited.outcome.retryAfter).toBeGreaterThan(0);
  });

  it("counts callers apart, so one typist cannot spend another's allowance", async () => {
    const limiter = new MemoryRateLimiter();
    for (let i = 0; i < ROUTE_RATE_LIMIT.limit; i += 1) await queryRoute("SBC", "NDLS", "203.0.113.7", { limiter, source: fixtureRouteSource });
    const other = await queryRoute("SBC", "NDLS", "198.51.100.4", { limiter, source: fixtureRouteSource });
    expect(other.outcome.ok).toBe(true);
  });
});
