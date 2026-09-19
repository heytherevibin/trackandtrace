import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEnv, type Env } from "@/services/env";
import { resetLocalState } from "@/services/shared-store";
import { resolvePnrSource } from "@/services/sources";

// Breaker state lives in this instance's memory here; each test starts closed.
afterEach(() => resetLocalState());

function envOf(source: Record<string, string>): Env {
  const parsed = parseEnv(source);
  if (!parsed.ok) throw new Error(parsed.issues.join("; "));
  return parsed.env;
}

describe("resolvePnrSource", () => {
  it("serves the labelled fixture when PNR_SOURCE=fixture outside production", async () => {
    const out = await resolvePnrSource(envOf({ NODE_ENV: "development", PNR_SOURCE: "fixture" })).check("2345678901");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.snapshot.source).toBe("fixture");
  });

  it("refuses the fixture in production even when the env guard is bypassed", async () => {
    const forced: Env = { ...envOf({ NODE_ENV: "development", PNR_SOURCE: "fixture" }), NODE_ENV: "production" };
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const out = await resolvePnrSource(forced).check("2345678901");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
    expect(out.message).toMatch(/production/i);
    error.mockRestore();
  });

  it("answers not configured when the live flag is off", async () => {
    const out = await resolvePnrSource(envOf({ NODE_ENV: "development" })).check("2345678901");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
    expect(out.message).toMatch(/not configured/i);
  });

  it("answers not connected, without throwing, when the live flag is on but no adapter exists", async () => {
    const out = await resolvePnrSource(envOf({ NODE_ENV: "development", LIVE_SOURCE_ENABLED: "1" })).check("2345678901");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toMatch(/not connected/i);
  });

  it("selects the RapidAPI adapter when PNR_SOURCE=rapidapi, labelled third-party", async () => {
    const current = envOf({ NODE_ENV: "production", PNR_SOURCE: "rapidapi", RAPIDAPI_KEY: "test-key-0123456789abcdef" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: false, message: "Flushed PNR" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await resolvePnrSource(current).check("4949608635");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toContain("irctc1.p.rapidapi.com");
    expect(out).toMatchObject({ ok: false, code: "NOT_FOUND" });
    vi.unstubAllGlobals();
  });

  it("selects the RailKit adapter when PNR_SOURCE=railkit, with its key in x-api-key", async () => {
    const key = "railkit_0123456789abcdef0123456789abcdef";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false, error: "PNR not found" }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await resolvePnrSource(envOf({ NODE_ENV: "production", PNR_SOURCE: "railkit", RAILKIT_API_KEY: key })).check("5827194603");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.railkit.in/api/v1/pnr/5827194603");
    expect(new Headers(init.headers).get("x-api-key")).toBe(key);
    expect(out).toMatchObject({ ok: false, code: "NOT_FOUND" });
    vi.unstubAllGlobals();
  });

  it("falls back to RapidAPI only while RailKit is unavailable", async () => {
    const current = envOf({
      NODE_ENV: "production",
      PNR_SOURCE: "railkit",
      RAILKIT_API_KEY: "railkit_0123456789abcdef0123456789abcdef",
      PNR_FALLBACK: "rapidapi",
      RAPIDAPI_KEY: "test-key-0123456789abcdef",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const hosts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        hosts.push(new URL(url).host);
        return url.includes("railkit")
          ? new Response("<html>Bad gateway</html>", { status: 502 })
          : new Response(JSON.stringify({ status: false, message: "Flushed PNR" }), { status: 200 });
      }),
    );
    const out = await resolvePnrSource(current).check("5827194603");
    // A 502 is a safe failure: RailKit is asked once more before the fallback.
    expect(hosts).toEqual(["api.railkit.in", "api.railkit.in", "irctc1.p.rapidapi.com"]);
    expect(out).toMatchObject({ ok: false, code: "NOT_FOUND" });

    hosts.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        hosts.push(new URL(url).host);
        return new Response(JSON.stringify({ success: false, error: "No PNR data found or invalid PNR number" }), { status: 400 });
      }),
    );
    const noRecord = await resolvePnrSource(current).check("5827194603");
    expect(noRecord).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(hosts).toEqual(["api.railkit.in"]);
    vi.unstubAllGlobals();
    warn.mockRestore();
  });
});
