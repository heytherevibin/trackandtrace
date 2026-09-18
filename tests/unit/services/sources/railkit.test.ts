import { afterEach, describe, expect, it, vi } from "vitest";
import { createRailkitSource, type RailkitConfig } from "@/services/sources/railkit";

const PNR = "5827194603";
const NOW = new Date("2026-08-21T06:30:00.000Z");
const CONFIG: RailkitConfig = { key: "railkit_0123456789abcdef0123456789abcdef", baseUrl: "https://api.railkit.in", timeoutMs: 8_000 };

const OK_BODY = {
  success: true,
  data: {
    pnr: PNR,
    train: { number: "12987", name: "SAMPURN K RAJDHANI" },
    journey: {
      dateOfJourney: "22 Aug 2026, 04:35:00 pm",
      class: "3A",
      quota: "GN",
      source: { code: "JP", name: "JAIPUR JN" },
      destination: { code: "NDLS", name: "NEW DELHI" },
    },
    chart: { status: "Chart Not Prepared" },
    passengers: [
      {
        serialNumber: "Passenger 1",
        booking: { status: "GNWL", coach: null, berthNo: 40, berthCode: null, details: "GNWL/40" },
        current: { status: "GNWL", coach: null, berthNo: 12, berthCode: null, details: "GNWL/12" },
      },
    ],
  },
};

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function sourceWith(fetchImpl: (...args: unknown[]) => Promise<Response>) {
  return createRailkitSource(CONFIG, { fetch: fetchImpl as unknown as typeof fetch, now: () => NOW });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createRailkitSource", () => {
  it("asks RailKit for the PNR with the key in x-api-key, without caching", async () => {
    const fetchMock = vi.fn(async () => response(200, OK_BODY));
    const out = await sourceWith(fetchMock).check(PNR);
    expect(out.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.railkit.in/api/v1/pnr/${PNR}`);
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("x-api-key")).toBe(CONFIG.key);
    expect(new Headers(init.headers).get("accept")).toBe("application/json");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns the parsed record labelled as RailKit", async () => {
    const out = await sourceWith(async () => response(200, OK_BODY)).check(PNR);
    expect(out.ok && out.result.snapshot.source).toBe("railkit");
    expect(out.ok && out.result.lead).toEqual({ status: "WL", position: 12, quota: "GN" });
  });

  it("refuses an invalid PNR before spending a request", async () => {
    const fetchMock = vi.fn();
    const out = await sourceWith(fetchMock).check("12345");
    expect(out).toMatchObject({ ok: false, code: "INVALID" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, { success: false, error: "Invalid API key" }, /key/i],
    [403, { success: false, error: "API key is inactive" }, /key|plan/i],
    [500, { success: false, error: "Internal error" }, /HTTP 500/],
    [502, "<html>Bad gateway</html>", /HTTP 502/],
  ])("answers HTTP %i as unavailable, never as data", async (status, body, message) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const out = await sourceWith(async () => response(status, body)).check(PNR);
    expect(out).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
    expect(!out.ok && out.message).toMatch(message);
    error.mockRestore();
    warn.mockRestore();
  });

  it("passes on when to retry after RailKit's quota or rate limit", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const byRetryAfter = await sourceWith(async () => response(429, { success: false, error: "Usage limit exceeded" }, { "retry-after": "120" })).check(PNR);
    expect(byRetryAfter).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE", retryAfter: 120 });
    const byReset = await sourceWith(async () => response(429, { success: false, error: "Too many requests" }, { "ratelimit-reset": "18" })).check(PNR);
    expect(byReset).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE", retryAfter: 18 });
    const withoutHint = await sourceWith(async () => response(429, { success: false, error: "Usage limit exceeded" })).check(PNR);
    expect(withoutHint).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
    expect(!withoutHint.ok && withoutHint.retryAfter).toBeUndefined();
  });

  it("reads RailKit's real no-record answer (HTTP 400, probed 2026-09-18) as Not found", async () => {
    const out = await sourceWith(async () => response(400, { success: false, error: "No PNR data found or invalid PNR number" })).check(PNR);
    expect(out).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("answers any other 4xx refusal as unavailable, never as a record", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refused = await sourceWith(async () => response(400, { success: false, error: "Invalid date format. Use DD-MM-YYYY." })).check(PNR);
    expect(refused).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
    const bare = await sourceWith(async () => response(422, "<html>Unprocessable</html>")).check(PNR);
    expect(bare).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });

  it("reads a 404 refusal that names a missing record as Not found", async () => {
    const out = await sourceWith(async () => response(404, { success: false, error: "PNR not found" })).check(PNR);
    expect(out).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("answers a timeout and an unreachable host as unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const timeout = await sourceWith(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }).check(PNR);
    expect(timeout).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
    expect(!timeout.ok && timeout.message).toMatch(/in time/i);
    const unreachable = await sourceWith(async () => {
      throw new TypeError("fetch failed");
    }).check(PNR);
    expect(unreachable).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
    expect(!unreachable.ok && unreachable.message).toMatch(/reached/i);
  });

  it("answers an unreadable body as unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const out = await sourceWith(async () => response(200, "not json")).check(PNR);
    expect(out).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });

  it("never writes the PNR, the key or the response body to the console", async () => {
    const calls: unknown[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        calls.push(...args);
      });
    }
    const bodies = [
      response(200, OK_BODY),
      response(401, { success: false, error: "Invalid API key" }),
      response(429, { success: false, error: "Usage limit exceeded" }),
      response(500, { success: false, error: `failed for ${PNR}` }),
      response(200, "not json"),
    ];
    for (const body of bodies) await sourceWith(async () => body).check(PNR);
    const printed = JSON.stringify(calls);
    expect(printed).not.toContain(PNR);
    expect(printed).not.toContain(CONFIG.key);
    expect(printed).not.toContain("SAMPURN");
  });
});
