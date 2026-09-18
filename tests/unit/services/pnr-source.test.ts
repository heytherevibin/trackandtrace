import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchPnr } from "@/services/pnr-source";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchPnr", () => {
  it("posts the PNR in the JSON body to /api/pnr, never in the address", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "NOT_FOUND", message: "none" }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchPnr("2345678901", { fresh: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/pnr");
    expect(url).not.toMatch(/\d{10}/);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ pnr: "2345678901", fresh: true });
  });

  it("omits fresh when it is not asked for", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "NOT_FOUND", message: "none" }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchPnr("2345678901");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ pnr: "2345678901" });
    expect(out.outcome).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});
