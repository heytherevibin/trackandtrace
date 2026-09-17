import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { pnrApiOkSchema } from "@/types/schemas";

async function loadRoute(overrides: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PNR_SOURCE", "fixture");
  for (const [k, v] of Object.entries(overrides)) vi.stubEnv(k, v);
  const { resetEnvCache } = await import("@/services/env");
  resetEnvCache();
  return import("@/app/api/pnr/[pnr]/route");
}

function call(route: Awaited<ReturnType<typeof loadRoute>>, pnr: string, opts: { ip?: string; fresh?: boolean } = {}) {
  const url = `http://localhost/api/pnr/${pnr}${opts.fresh ? "?fresh=1" : ""}`;
  const req = new NextRequest(url, { headers: { "x-forwarded-for": opts.ip ?? "203.0.113.10" } });
  return route.GET(req, { params: Promise.resolve({ pnr }) });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/pnr/[pnr]", () => {
  it("returns 400 INVALID_INPUT for nine digits", async () => {
    const route = await loadRoute();
    const res = await call(route, "234567890");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("returns 404 NOT_FOUND for a fixture PNR ending in 00", async () => {
    const route = await loadRoute();
    const res = await call(route, "2345678900");
    expect(res.status).toBe(404);
  });

  it("returns a validated envelope with source fixture, then a cached second read", async () => {
    const route = await loadRoute();
    const first = await call(route, "2345678901");
    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    const body = pnrApiOkSchema.parse(await first.json());
    expect(body.source).toBe("fixture");
    expect(body.cached).toBe(false);
    expect(body.data.snapshot.pnr).toBe("2345678901");
    const second = pnrApiOkSchema.parse(await (await call(route, "2345678901")).json());
    expect(second.cached).toBe(true);
    const fresh = pnrApiOkSchema.parse(await (await call(route, "2345678901", { fresh: true })).json());
    expect(fresh.cached).toBe(false);
  });

  it("returns 429 with Retry-After after twenty calls from one address", async () => {
    const route = await loadRoute();
    for (let i = 0; i < 20; i += 1) await call(route, "2345678901", { ip: "198.51.100.7" });
    const res = await call(route, "2345678901", { ip: "198.51.100.7" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("returns 503 SOURCE_UNAVAILABLE when the live source is selected", async () => {
    const route = await loadRoute({ PNR_SOURCE: "live" });
    const res = await call(route, "2345678901");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });
});
