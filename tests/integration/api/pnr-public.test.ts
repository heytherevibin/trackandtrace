import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Travellers see one service. The provider behind a check never reaches the browser: not in the
// envelope, not in the record, not in a message.

const KEY = "railkit_0123456789abcdef0123456789abcdef";
const RECORD = {
  success: true,
  data: {
    pnr: "5827194603",
    train: { number: "12987", name: "SAMPURN K RAJDHANI" },
    journey: {
      dateOfJourney: "22 Aug 2026, 04:35:00 pm",
      class: "3A",
      quota: "GN",
      source: { code: "JP", name: "JAIPUR JN" },
      destination: { code: "NDLS", name: "NEW DELHI" },
    },
    chart: { status: "Chart Prepared" },
    passengers: [{ serialNumber: "Passenger 1", booking: { status: "CNF", coach: "B5", berthNo: 22, berthCode: "LB" }, current: { status: "CNF", coach: "B5", berthNo: 22, berthCode: "LB" } }],
  },
};

async function loadRoute() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PNR_SOURCE", "railkit");
  vi.stubEnv("RAILKIT_API_KEY", KEY);
  const { resetEnvCache } = await import("@/services/env");
  resetEnvCache();
  return import("@/app/api/pnr/route");
}

async function post(route: Awaited<ReturnType<typeof loadRoute>>, ip: string) {
  const req = new NextRequest("http://localhost/api/pnr", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ pnr: "5827194603" }) });
  return route.POST(req);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/pnr never names the provider", () => {
  it("labels a provider's record as the service's own", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(RECORD), { status: 200 })));
    const res = await post(await loadRoute(), "192.0.2.10");
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toMatch(/railkit|rapidapi|irctcapi/i);
    const body = JSON.parse(text) as { source: string; data: { snapshot: { source: string } } };
    expect(body.source).toBe("live");
    expect(body.data.snapshot.source).toBe("live");
  });

  it("keeps a provider failure's message neutral", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 502 })));
    const res = await post(await loadRoute(), "192.0.2.11");
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(text).not.toMatch(/railkit|rapidapi|irctcapi/i);
  });
});
