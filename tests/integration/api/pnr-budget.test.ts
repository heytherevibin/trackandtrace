import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The daily live-request budget over the shared store: two "instances" share one fake Upstash,
// as Vercel functions share the real one. Once the day's budget is spent, checks are answered
// from the shared cache or refused until midnight IST, and the provider is never asked.

const fake = await vi.hoisted(async () => {
  const { createFakeUpstash } = await import("../../support/fake-upstash");
  return createFakeUpstash();
});

vi.mock("@/services/upstash", () => ({
  connectRedis: () => fake.redis,
  upstashWindows: () => fake.windows,
}));

const DATA_KEY = Buffer.alloc(32, 7).toString("base64");
const FAKE_RAPIDAPI = "fake-rapidapi-0123456789";
const PNRS = ["4949608631", "4949608632", "4949608633"] as const;
const requests = { provider: 0 };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

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

async function instance() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PNR_SOURCE", "rapidapi");
  vi.stubEnv("PNR_FALLBACK", "none");
  vi.stubEnv("RAPIDAPI_KEY", FAKE_RAPIDAPI);
  vi.stubEnv("LIVE_REQUESTS_PER_DAY", "2");
  vi.stubEnv("KV_REST_API_URL", "https://fake.upstash.io");
  vi.stubEnv("KV_REST_API_TOKEN", "fake-token");
  vi.stubEnv("DATA_KEY", DATA_KEY);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      requests.provider += 1;
      return json(200, rapidApiRecord(new URL(String(input)).searchParams.get("pnrNumber") ?? ""));
    }),
  );
  const { resetEnvCache } = await import("@/services/env");
  resetEnvCache();
  return import("@/app/api/pnr/route");
}

async function check(route: Awaited<ReturnType<typeof instance>>, pnr: string, options: { readonly fresh?: boolean; readonly ip?: string } = {}) {
  const res = await route.POST(
    new NextRequest("http://localhost/api/pnr", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": options.ip ?? "203.0.113.30" },
      body: JSON.stringify(options.fresh ? { pnr, fresh: true } : { pnr }),
    }),
  );
  return {
    status: res.status,
    retryAfter: res.headers.get("retry-after"),
    body: (await res.json()) as { ok: boolean; cached?: boolean; code?: string; message?: string; retryAfter?: number },
  };
}

beforeEach(() => {
  fake.reset();
  requests.provider = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/pnr past the daily live-request budget", () => {
  it("shares one budget across instances, then answers from the cache or not at all, without asking the provider", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await instance();
    const b = await instance();

    expect((await check(a, PNRS[0])).body).toMatchObject({ ok: true, cached: false });
    expect((await check(b, PNRS[1], { ip: "203.0.113.31" })).body).toMatchObject({ ok: true, cached: false });

    const refused = await check(a, PNRS[2]);
    expect(refused.status).toBe(503);
    expect(refused.body).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
    expect(refused.body.message).toMatch(/00:00 IST/);
    expect(refused.body.message).not.toMatch(/railkit|rapidapi/i);
    const wait = Number(refused.retryAfter);
    expect(wait).toBe(refused.body.retryAfter);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(24 * 60 * 60);

    expect((await check(b, PNRS[2])).status).toBe(503);
    expect((await check(b, PNRS[0])).body).toMatchObject({ ok: true, cached: true });
    expect((await check(a, PNRS[1], { fresh: true })).body).toMatchObject({ ok: true, cached: true });

    expect(requests.provider).toBe(2);
    const reports = warn.mock.calls.filter((call) => String(call[0]).startsWith("[budget]"));
    expect(reports).toHaveLength(1);
    expect(JSON.stringify(reports)).not.toMatch(/\d{10}/);
  });

  it("keeps the budget's count and marker free of PNRs and addresses", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await instance();
    for (const pnr of PNRS) await check(a, pnr);
    const held = fake.dump();
    for (const pnr of PNRS) expect(held).not.toContain(pnr);
    expect(held).not.toContain("203.0.113.30");
    expect(held).toMatch(/:budget:live:\d{4}-\d{2}-\d{2}=3/);
  });
});
