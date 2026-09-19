import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RailKit failing repeatedly: its breaker opens after five failures, and from then
// on checks go straight to the fallback without spending a RailKit request.

const FAKE_RAILKIT = `railkit_${"a1".repeat(16)}`;
const FAKE_RAPIDAPI = "fake-rapidapi-0123456789";
const PNRS = ["4949608631", "4949608632", "4949608633", "4949608634", "4949608635", "4949608636"];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A record for whichever PNR the fallback was asked about. */
function rapidApiRecord(pnr: string) {
  return {
    status: true,
    message: "Success",
    data: {
      Pnr: pnr,
      TrainNo: "12658",
      TrainName: "SBC MAS SF MAIL",
      Doj: "25-12-2026",
      From: "SBC",
      To: "MAS",
      Class: "3A",
      Quota: "GN",
      PassengerStatus: [{ Number: 1, BookingStatus: "GNWL/12", CurrentStatus: "GNWL 5" }],
    },
  };
}

const requests = { railkit: 0, rapidapi: 0 };

async function loadRoute() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PNR_SOURCE", "railkit");
  vi.stubEnv("PNR_FALLBACK", "rapidapi");
  vi.stubEnv("RAILKIT_API_KEY", FAKE_RAILKIT);
  vi.stubEnv("RAPIDAPI_KEY", FAKE_RAPIDAPI);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.hostname === "api.railkit.in") {
        requests.railkit += 1;
        return json(500, { success: false, error: "Internal error" });
      }
      requests.rapidapi += 1;
      return json(200, rapidApiRecord(url.searchParams.get("pnrNumber") ?? ""));
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
  return (await res.json()) as { ok: boolean };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  requests.railkit = 0;
  requests.rapidapi = 0;
});

describe("POST /api/pnr with the primary provider failing", () => {
  it("opens the primary's breaker after five failures, then answers from the fallback without asking the primary", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const route = await loadRoute();
    for (const pnr of PNRS.slice(0, 5)) expect(await check(route, pnr)).toMatchObject({ ok: true });
    expect(requests).toEqual({ railkit: 5, rapidapi: 5 });

    expect(await check(route, PNRS[5])).toMatchObject({ ok: true });
    expect(requests).toEqual({ railkit: 5, rapidapi: 6 });
  });
});
