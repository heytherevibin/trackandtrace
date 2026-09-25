import { describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";
import { createRailKitRouteSource } from "@/services/sources/railkit-route";

// ---------------------------------------------------------------------------
// The trains-between adapter. Its job is to spend one request, read the status
// it gets, and never turn a refusal into "no trains run that pair" — the same
// false-negative rule the availability adapter is built around, one step
// earlier in the journey.
//
// A station pair that cannot be read is refused BEFORE a request is spent: the
// provider's monthly budget is shared with live PNR checks and the crawler.
// ---------------------------------------------------------------------------

const OUT = messages.source.outcomes;
const ROUTE = messages.source.route;
const NOW = new Date("2026-09-25T06:30:00.000Z");

const CONFIG = { key: "railkit_testkeytestkeytestkey", baseUrl: "https://api.railkit.in", timeoutMs: 5_000 };

const TRAIN = {
  train_no: "12627",
  train_name: "KARNATAKA EXP",
  source_stn_code: "SBC",
  source_stn_name: "KSR BENGALURU",
  dstn_stn_code: "NDLS",
  dstn_stn_name: "NEW DELHI",
  from_stn_code: "SBC",
  from_stn_name: "KSR BENGALURU",
  to_stn_code: "NDLS",
  to_stn_name: "NEW DELHI",
  from_time: "20:00",
  to_time: "06:10",
  travel_time: "34:10 hrs",
  running_days: "1111111",
  distance: "2444",
  halts: 31,
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const source = (fetchImpl: typeof fetch) => createRailKitRouteSource(CONFIG, { fetch: fetchImpl, now: () => NOW });

describe("createRailKitRouteSource", () => {
  it("asks trains/between with the key in a header, never in the path", async () => {
    const doFetch = vi.fn<typeof fetch>().mockResolvedValue(json({ success: true, data: [TRAIN] }));
    const out = await source(doFetch).check({ from: " sbc ", to: "ndls" });

    expect(out.ok).toBe(true);
    const [url, init] = doFetch.mock.calls[0] ?? [];
    expect(url).toBe("https://api.railkit.in/api/v1/trains/between/SBC/NDLS");
    expect(String(url)).not.toContain(CONFIG.key);
    expect(new Headers(init?.headers).get("x-api-key")).toBe(CONFIG.key);
  });

  it("refuses an unreadable station pair without spending a request", async () => {
    const doFetch = vi.fn<typeof fetch>();
    for (const pair of [{ from: "", to: "NDLS" }, { from: "S", to: "NDLS" }, { from: "SBC", to: "TOOLONGCODE" }, { from: "SB3", to: "NDLS" }]) {
      const out = await source(doFetch).check(pair);
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.code).toBe("INVALID");
      expect(out.message).toBe(ROUTE.invalidRequest);
    }
    expect(doFetch).not.toHaveBeenCalled();
  });

  it("answers with an empty list when the pair has no trains", async () => {
    const out = await source(vi.fn<typeof fetch>().mockResolvedValue(json({ success: true, data: [] }))).check({ from: "SBC", to: "NDLS" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.answer.trains).toEqual([]);
  });

  it("maps a refused key, a quota and a server error to unavailable, never to no trains", async () => {
    const cases = [
      { status: 401, cause: "refused", message: OUT.refused },
      { status: 403, cause: "refused", message: OUT.refused },
      { status: 429, cause: "quota", message: OUT.busy },
      { status: 500, cause: "server", message: OUT.error },
    ] as const;
    for (const { status, cause, message } of cases) {
      const out = await source(vi.fn<typeof fetch>().mockResolvedValue(json({ success: false, error: "no" }, status))).check({ from: "SBC", to: "NDLS" });
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.code).toBe("SOURCE_UNAVAILABLE");
      expect(out.cause).toBe(cause);
      expect(out.message).toBe(message);
      expect(out).not.toHaveProperty("answer");
    }
  });

  it("maps a 4xx refusal to unavailable rather than an empty route", async () => {
    const out = await source(vi.fn<typeof fetch>().mockResolvedValue(json({ success: false, error: "Invalid station code" }, 400))).check({ from: "SBC", to: "NDLS" });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
    expect(out.message).toBe(ROUTE.couldNotAnswer);
  });

  it("reads a timeout and a network failure apart, because only one of them may be retried", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const timedOut = await source(vi.fn<typeof fetch>().mockRejectedValue(timeout)).check({ from: "SBC", to: "NDLS" });
    expect(timedOut.ok).toBe(false);
    if (timedOut.ok) return;
    expect(timedOut.cause).toBe("timeout");

    const down = await source(vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"))).check({ from: "SBC", to: "NDLS" });
    expect(down.ok).toBe(false);
    if (down.ok) return;
    expect(down.cause).toBe("network");
  });

  it("marks a body it cannot read as unreadable, so the breaker can tell it from an outage", async () => {
    const out = await source(vi.fn<typeof fetch>().mockResolvedValue(json({ success: true, data: "none" }))).check({ from: "SBC", to: "NDLS" });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.cause).toBe("unreadable");
    expect(out.message).toBe(OUT.unreadable);
  });
});
