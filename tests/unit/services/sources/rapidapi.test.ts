import { describe, expect, it, vi } from "vitest";
import { createRapidApiSource, type RapidApiConfig } from "@/services/sources/rapidapi";

const PNR = "4949608635";
const NOW = new Date("2026-09-17T06:30:00.000Z");
const CONFIG: RapidApiConfig = { key: "test-key-0123456789abcdef", host: "irctc1.p.rapidapi.com", path: "/api/v3/getPNRStatus", timeoutMs: 8_000 };

const OK_BODY = {
  status: true,
  message: "Success",
  data: {
    Pnr: PNR,
    TrainNo: "12658",
    TrainName: "SBC MAS SF MAIL",
    Doj: "25-09-2026",
    From: "SBC",
    To: "MAS",
    Class: "3A",
    Quota: "GN",
    PassengerStatus: [{ Number: 1, BookingStatus: "GNWL/12", CurrentStatus: "GNWL 5" }],
  },
};

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function sourceWith(fetchImpl: typeof fetch) {
  return createRapidApiSource(CONFIG, { fetch: fetchImpl, now: () => NOW });
}

describe("createRapidApiSource", () => {
  it("asks the configured host for the PNR with the RapidAPI headers, without caching", async () => {
    const fetchMock = vi.fn(async () => response(200, OK_BODY));
    const out = await sourceWith(fetchMock as unknown as typeof fetch).check(PNR);
    expect(out.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://irctc1.p.rapidapi.com/api/v3/getPNRStatus?pnrNumber=${PNR}`);
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("x-rapidapi-key")).toBe(CONFIG.key);
    expect(new Headers(init.headers).get("x-rapidapi-host")).toBe(CONFIG.host);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns the parsed record labelled as third-party", async () => {
    const out = await sourceWith((async () => response(200, OK_BODY)) as unknown as typeof fetch).check(PNR);
    expect(out.ok && out.result.snapshot.source).toBe("rapidapi");
  });

  it("refuses an invalid PNR before spending a request", async () => {
    const fetchMock = vi.fn();
    const out = await sourceWith(fetchMock as unknown as typeof fetch).check("12345");
    expect(out).toMatchObject({ ok: false, code: "INVALID" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, "SOURCE_UNAVAILABLE", /key/i],
    [403, "SOURCE_UNAVAILABLE", /key|subscri/i],
    [429, "SOURCE_UNAVAILABLE", /quota/i],
    [500, "SOURCE_UNAVAILABLE", /error/i],
    [503, "SOURCE_UNAVAILABLE", /error/i],
  ] as const)("maps HTTP %i to %s", async (status, code, message) => {
    const out = await sourceWith((async () => response(status, { message: "nope" }, { "retry-after": "30" })) as unknown as typeof fetch).check(PNR);
    expect(out).toMatchObject({ ok: false, code });
    if (out.ok) return;
    expect(out.message).toMatch(message);
    if (status === 429) expect(out.retryAfter).toBe(30);
  });

  it("maps a timeout and a network failure to an unavailable source, never throwing", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    const timedOut = await sourceWith((async () => Promise.reject(timeout)) as unknown as typeof fetch).check(PNR);
    expect(timedOut).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
    if (!timedOut.ok) expect(timedOut.message).toMatch(/time/i);
    const offline = await sourceWith((async () => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch).check(PNR);
    expect(offline).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });

  it("fails closed on a body that is not JSON", async () => {
    const out = await sourceWith((async () => new Response("<html>upstream</html>", { status: 200 })) as unknown as typeof fetch).check(PNR);
    expect(out).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });

  it("passes the provider's refusal through as no record", async () => {
    const out = await sourceWith((async () => response(200, { status: false, message: "Flushed PNR / PNR not yet generated" })) as unknown as typeof fetch).check(PNR);
    expect(out).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("never logs the PNR or the key", async () => {
    const spies = [vi.spyOn(console, "error").mockImplementation(() => undefined), vi.spyOn(console, "warn").mockImplementation(() => undefined), vi.spyOn(console, "info").mockImplementation(() => undefined)];
    await sourceWith((async () => response(500, { message: `bad ${PNR}` })) as unknown as typeof fetch).check(PNR);
    await sourceWith((async () => Promise.reject(new TypeError(`fetch failed for ${PNR}`))) as unknown as typeof fetch).check(PNR);
    for (const spy of spies) {
      const logged = spy.mock.calls.flat().map(String).join(" ");
      expect(logged).not.toContain(PNR);
      expect(logged).not.toContain(CONFIG.key);
    }
  });
});
