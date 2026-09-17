import { describe, expect, it } from "vitest";
import { jsonError, jsonOk } from "@/services/api-response";
import { AppError } from "@/services/errors";

describe("jsonOk", () => {
  it("sets no-store and nosniff headers", async () => {
    const res = jsonOk({ ok: true, data: 1 });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await res.json()).toEqual({ ok: true, data: 1 });
  });
});

describe("jsonError", () => {
  it("maps an AppError to its status and adds Retry-After when present", async () => {
    const res = jsonError(new AppError("RATE_LIMITED", "slow down", { retryAfter: 12 }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("12");
    expect(await res.json()).toMatchObject({ ok: false, code: "RATE_LIMITED", retryAfter: 12 });
  });

  it("accepts an already-shaped error body", async () => {
    const res = jsonError({ ok: false, code: "NOT_FOUND", message: "none" });
    expect(res.status).toBe(404);
  });

  it("falls back to 500 INTERNAL for unknown throwables", async () => {
    const res = jsonError(new Error("boom"));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, code: "INTERNAL" });
  });
});
