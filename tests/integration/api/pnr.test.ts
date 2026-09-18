import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { pnrApiOkSchema } from "@/types/schemas";

// The PNR travels in the JSON body of a POST: request bodies are not recorded in platform request
// logs, paths and query strings are.

async function loadRoute(overrides: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PNR_SOURCE", "fixture");
  for (const [k, v] of Object.entries(overrides)) vi.stubEnv(k, v);
  const { resetEnvCache } = await import("@/services/env");
  resetEnvCache();
  return import("@/app/api/pnr/route");
}

function post(route: Awaited<ReturnType<typeof loadRoute>>, body: unknown, ip = "203.0.113.10") {
  const req = new NextRequest("http://localhost/api/pnr", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return route.POST(req);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/pnr", () => {
  it("answers only POST: no route takes a PNR in the path or query", async () => {
    const route = await loadRoute();
    expect(Object.keys(route).filter((k) => ["GET", "PUT", "DELETE", "PATCH"].includes(k))).toEqual([]);
  });

  it("returns 400 INVALID_INPUT for nine digits", async () => {
    const res = await post(await loadRoute(), { pnr: "234567890" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it.each([
    ["a body that is not JSON", "pnr=2345678901"],
    ["a missing PNR", {}],
    ["a numeric PNR", { pnr: 2345678901 }],
    ["an unexpected field", { pnr: "2345678901", name: "x" }],
    ["a non-boolean fresh flag", { pnr: "2345678901", fresh: "1" }],
  ])("returns 400 INVALID_INPUT for %s", async (_label, body) => {
    const res = await post(await loadRoute(), body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("returns 404 NOT_FOUND for a fixture PNR ending in 00", async () => {
    const res = await post(await loadRoute(), { pnr: "2345678900" });
    expect(res.status).toBe(404);
  });

  it("returns a validated envelope with source fixture, then a cached second read, and a fresh read on request", async () => {
    const route = await loadRoute();
    const first = await post(route, { pnr: "2345678901" });
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    const body = pnrApiOkSchema.parse(await first.json());
    expect(body.source).toBe("fixture");
    expect(body.cached).toBe(false);
    const second = pnrApiOkSchema.parse(await (await post(route, { pnr: "2345678901" })).json());
    expect(second.cached).toBe(true);
    const fresh = pnrApiOkSchema.parse(await (await post(route, { pnr: "2345678901", fresh: true })).json());
    expect(fresh.cached).toBe(false);
  });

  it("returns 429 with Retry-After after twenty calls from one address", async () => {
    const route = await loadRoute();
    for (let i = 0; i < 20; i += 1) await post(route, { pnr: "2345678901" }, "198.51.100.7");
    const res = await post(route, { pnr: "2345678901" }, "198.51.100.7");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("returns 503 SOURCE_UNAVAILABLE when the live source is selected", async () => {
    const res = await post(await loadRoute({ PNR_SOURCE: "live" }), { pnr: "2345678901" });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });
});
