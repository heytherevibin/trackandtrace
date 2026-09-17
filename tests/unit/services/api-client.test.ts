import { describe, expect, it } from "vitest";
import { z } from "zod";
import { apiRequest } from "@/services/api-client";

const schema = z.object({ ok: z.literal(true), value: z.number() });

function fetchWith(body: unknown, init: { status?: number; json?: boolean } = {}): typeof fetch {
  return async () =>
    new Response(init.json === false ? "not json" : JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
}

describe("apiRequest", () => {
  it("returns validated data on success", async () => {
    const out = await apiRequest("/x", {}, schema, { fetchImpl: fetchWith({ ok: true, value: 3 }) });
    expect(out).toEqual({ ok: true, data: { ok: true, value: 3 } });
  });

  it("maps a network failure to SOURCE_UNAVAILABLE", async () => {
    const failing: typeof fetch = async () => {
      throw new TypeError("offline");
    };
    const out = await apiRequest("/x", {}, schema, { fetchImpl: failing });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("SOURCE_UNAVAILABLE");
  });

  it("maps a non-JSON body to INTERNAL", async () => {
    const out = await apiRequest("/x", {}, schema, { fetchImpl: fetchWith(null, { json: false }) });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("INTERNAL");
  });

  it("maps a schema mismatch to INTERNAL with a malformed message", async () => {
    const out = await apiRequest("/x", {}, schema, { fetchImpl: fetchWith({ ok: true, value: "x" }) });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("INTERNAL");
    expect(out.error.message).toMatch(/malformed/i);
  });

  it("passes a server error envelope through with code, message, and retryAfter", async () => {
    const out = await apiRequest("/x", {}, schema, {
      fetchImpl: fetchWith({ ok: false, code: "RATE_LIMITED", message: "wait", retryAfter: 7 }, { status: 429 }),
    });
    expect(out).toEqual({ ok: false, error: { ok: false, code: "RATE_LIMITED", message: "wait", retryAfter: 7 } });
  });
});
