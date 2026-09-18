import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Two "instances" (fresh module graphs) share one fake Upstash, as Vercel functions share the real one.

const fake = await vi.hoisted(async () => {
  const { createFakeUpstash } = await import("../../support/fake-upstash");
  return createFakeUpstash();
});

vi.mock("@/services/upstash", () => ({
  connectRedis: () => fake.redis,
  upstashWindows: () => fake.windows,
}));

const DATA_KEY = Buffer.alloc(32, 7).toString("base64");
const PNR = "2345678901";
const IP = "203.0.113.10";

async function instance() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PNR_SOURCE", "fixture");
  vi.stubEnv("KV_REST_API_URL", "https://fake.upstash.io");
  vi.stubEnv("KV_REST_API_TOKEN", "fake-token");
  vi.stubEnv("DATA_KEY", DATA_KEY);
  const { resetEnvCache } = await import("@/services/env");
  resetEnvCache();
  return import("@/app/api/pnr/route");
}

async function check(route: Awaited<ReturnType<typeof instance>>, ip = IP) {
  const res = await route.POST(
    new NextRequest("http://localhost/api/pnr", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ pnr: PNR }),
    }),
  );
  return { status: res.status, body: (await res.json()) as { ok: boolean; cached?: boolean; code?: string } };
}

beforeEach(() => fake.reset());
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/pnr over the shared store", () => {
  it("answers a second instance from the shared cache", async () => {
    const a = await instance();
    const b = await instance();
    expect((await check(a)).body).toMatchObject({ ok: true, cached: false });
    expect((await check(b)).body).toMatchObject({ ok: true, cached: true });
  });

  it("never hands Upstash a PNR, a record or an address in the clear", async () => {
    await check(await instance());
    const held = fake.dump();
    expect(held).not.toContain(PNR);
    expect(held).not.toContain(IP);
    expect(held).not.toMatch(/"snapshot"|"pax"/);
  });

  it("shares the limit: the 21st check across two instances is refused", async () => {
    const a = await instance();
    const b = await instance();
    for (let i = 0; i < 10; i += 1) await check(a);
    for (let i = 0; i < 10; i += 1) await check(b);
    const refused = await check(a);
    expect(refused.status).toBe(429);
    expect(refused.body.code).toBe("RATE_LIMITED");
  });

  it("keeps answering, and limiting per instance, while Upstash is down", async () => {
    fake.fail(true);
    const a = await instance();
    const first = await check(a);
    expect(first.body).toMatchObject({ ok: true, cached: false });
    for (let i = 0; i < 19; i += 1) await check(a);
    expect((await check(a)).status).toBe(429);
  });
});
