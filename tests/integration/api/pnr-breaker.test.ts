import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RailKit failing repeatedly: its breaker opens after five failures, and from then on checks are
// refused without spending a RailKit request. With `PNR_FALLBACK=none` — the only setting there
// is, see src/services/env.ts — that refusal is the traveller's final answer, so what the breaker
// buys is the provider's allowance and not a second opinion. It must still never read as "no
// record". The breaker itself is generic over the provider and the caller (services/breaker.ts).

const FAKE_RAILKIT = `railkit_${"a1".repeat(16)}`;
const PNRS = ["4949608631", "4949608632", "4949608633", "4949608634", "4949608635", "4949608636"];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const requests = { railkit: 0 };

async function loadRoute() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PNR_SOURCE", "railkit");
  vi.stubEnv("PNR_FALLBACK", "none");
  vi.stubEnv("RAILKIT_API_KEY", FAKE_RAILKIT);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      expect(new URL(String(input)).hostname).toBe("api.railkit.in");
      requests.railkit += 1;
      return json(500, { success: false, error: "Internal error" });
    }),
  );
  const { resetEnvCache } = await import("@/services/env");
  resetEnvCache();
  return import("@/app/api/pnr/route");
}

async function check(route: Awaited<ReturnType<typeof loadRoute>>, pnr: string) {
  const res = await route.POST(
    new NextRequest("http://localhost/api/pnr", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.20" },
      body: JSON.stringify({ pnr }),
    }),
  );
  return { status: res.status, body: (await res.json()) as { ok: boolean; code?: string; message?: string } };
}

beforeEach(() => {
  requests.railkit = 0;
});

afterEach(async () => {
  const { resetLocalState } = await import("@/services/shared-store");
  resetLocalState();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/pnr with the only provider failing", () => {
  it("opens the breaker after five failures, then stops asking the provider at all", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const route = await loadRoute();
    for (const pnr of PNRS.slice(0, 5)) {
      const out = await check(route, pnr);
      expect(out.status).toBe(503);
      expect(out.body).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
    }
    expect(requests.railkit).toBe(5);

    const resting = await check(route, PNRS[5]);
    expect(resting.status).toBe(503);
    expect(resting.body).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
    // The sixth check never reaches the provider: that is the whole point of the breaker.
    expect(requests.railkit).toBe(5);
  });

  it("never turns a provider failure into a missing reservation, or names the provider", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const route = await loadRoute();
    for (const pnr of PNRS) {
      const out = await check(route, pnr);
      expect(out.body.code).not.toBe("NOT_FOUND");
      expect(out.body.message ?? "").not.toMatch(/railkit|rapidapi|irctcapi/i);
    }
  });
});
