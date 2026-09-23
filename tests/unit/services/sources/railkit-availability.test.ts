import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";
import { createRailKitAvailabilitySource, type RailkitAvailabilityConfig } from "@/services/sources/railkit-availability";
import type { AvailabilityOutcome, AvailabilityRequest } from "@/services/availability-source";

// ---------------------------------------------------------------------------
// The adapter. Everything here was measured on 2026-09-23; nothing needs the
// network to prove.
//
// The contract it exists to keep: every way the provider can refuse reads as
// "we could not ask", never as "there are no berths" and never as an answer
// carrying no days. The reverse is pinned too -- a sold-out day is an answer.
// ---------------------------------------------------------------------------

const OUT = messages.source.outcomes;
const AV = messages.source.availability;
const NOW = new Date("2026-09-23T06:30:00.000Z");
const CONFIG: RailkitAvailabilityConfig = { key: "railkit_0123456789abcdef0123456789abcdef", baseUrl: "https://api.railkit.in", timeoutMs: 8_000 };

const REQUEST: AvailabilityRequest = {
  trainNo: "12621",
  from: "MAS",
  to: "NDLS",
  journeyDate: "2026-09-23",
  travelClass: "SL",
  quota: "GN",
};

const OK_BODY = {
  success: true,
  data: {
    train: { trainNo: "12621", trainName: "TAMIL NADU EXP", from: "MAS", to: "NDLS", fromStationName: "MGR CHENNAI CTL", toStationName: "NEW DELHI", distance: 2175, travelClass: "SL", quota: "GN" },
    fare: { baseFare: 710, reservationCharge: 40, superfastCharge: 30, serviceTax: 0, totalFare: 780 },
    availability: [
      { date: "23-9-2026", status: "WAITLIST", availabilityText: "Not Available", rawStatus: "NOT AVAILABLE", prediction: "No More Booking", predictionPercentage: 0, canBook: false },
      { date: "24-9-2026", status: "WAITLIST", availabilityText: "WL 26", rawStatus: "GNWL65/WL26", prediction: "77% Chance", predictionPercentage: 77, canBook: true },
    ],
  },
};

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

/** Every stub below is a `fetch` of this shape, so the recorded calls stay typed and no cast is needed to read a URL. */
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function sourceWith(fetchImpl: FetchLike) {
  return createRailKitAvailabilitySource(CONFIG, { fetch: fetchImpl as unknown as typeof fetch, now: () => NOW });
}

/** No outcome may ever be "fine, and there are no days": that is what a page would read as sold out. */
function expectNotAnEmptyAnswer(out: AvailabilityOutcome): void {
  expect(out.ok).toBe(false);
  if (out.ok) expect(out.answer.days.length).toBeGreaterThan(0);
}

const timedOut = () => Promise.reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
const unreachable = () => Promise.reject(new TypeError("fetch failed"));

beforeEach(() => {
  // The server log has its own tests; here it only has to stay out of the run.
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the request it sends", () => {
  it("asks for the seats endpoint with the key in x-api-key, without caching", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => response(200, OK_BODY));
    const out = await sourceWith(fetchMock).check(REQUEST);
    expect(out.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.railkit.in/api/v1/seats/12621/MAS/NDLS/23-09-2026/SL/GN");
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("x-api-key")).toBe(CONFIG.key);
    expect(new Headers(init.headers).get("accept")).toBe("application/json");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("converts the ISO date once, so an ISO date never reaches the URL", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => response(200, OK_BODY));
    for (const journeyDate of ["2026-09-23", "2026-10-01", "2026-12-31"]) {
      await sourceWith(fetchMock).check({ ...REQUEST, journeyDate });
    }
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      "https://api.railkit.in/api/v1/seats/12621/MAS/NDLS/23-09-2026/SL/GN",
      "https://api.railkit.in/api/v1/seats/12621/MAS/NDLS/01-10-2026/SL/GN",
      "https://api.railkit.in/api/v1/seats/12621/MAS/NDLS/31-12-2026/SL/GN",
    ]);
    for (const url of urls) expect(url).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("upper-cases the station codes, class and quota it was given", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => response(200, OK_BODY));
    await sourceWith(fetchMock).check({ ...REQUEST, from: "mas", to: "ndls", travelClass: "sl", quota: "gn" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.railkit.in/api/v1/seats/12621/MAS/NDLS/23-09-2026/SL/GN");
  });

  it.each([
    ["a train number that is not five digits", { trainNo: "126" }],
    ["a station code that is not a station code", { from: "M4S!" }],
    ["a destination that is not a station code", { to: "" }],
    ["a class this product does not know", { travelClass: "ZZ" }],
    ["a quota this product does not know", { quota: "QQ" }],
    ["a date that is not ISO", { journeyDate: "23-09-2026" }],
    ["a date that is not a date", { journeyDate: "2026-02-30" }],
  ])("refuses %s before spending a request", async (_label, patch) => {
    const fetchMock = vi.fn();
    const out = await sourceWith(fetchMock).check({ ...REQUEST, ...patch });
    expect(out).toMatchObject({ ok: false, code: "INVALID" });
    expect(fetchMock).not.toHaveBeenCalled();
    expectNotAnEmptyAnswer(out);
  });
});

describe("the answer it returns", () => {
  it("returns the parsed days, sold-out ones included", async () => {
    const out = await sourceWith(async () => response(200, OK_BODY)).check(REQUEST);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.answer.days).toHaveLength(2);
    expect(out.answer.days[0]).toMatchObject({ date: "2026-09-23", canBook: false, rawStatus: "NOT AVAILABLE" });
    expect(out.answer.days[1]).toMatchObject({ date: "2026-09-24", canBook: true, wlBooking: 65, wlCurrent: 26 });
    expect(out.answer.retrievedAt).toBe(NOW.toISOString());
  });

  it("returns a REGRET day as an answer, not as a failure", async () => {
    const regret = { ...OK_BODY, data: { ...OK_BODY.data, availability: [{ date: "24-9-2026", status: "REGRET", availabilityText: "Regret", rawStatus: "REGRET", prediction: "No More Booking", predictionPercentage: 0, canBook: false }] } };
    const out = await sourceWith(async () => response(200, regret)).check(REQUEST);
    expect(out.ok).toBe(true);
    expect(out.ok && out.answer.days[0]).toMatchObject({ status: "REGRET", canBook: false });
  });
});

describe("every measured refusal reads as unavailable, never as no seats", () => {
  const REFUSALS = [
    ["the route is wrong for that train", 400, { success: false, error: "MAS is not an intermediate station of train 12951" }, "INVALID", AV.notOnRoute],
    ["our own date format bug", 400, { success: false, error: "Invalid date format. Use DD-MM-YYYY." }, "INVALID", AV.dateNotAccepted],
    ["a date the provider could not normalise", 400, { success: false, error: "Date still invalid after normalization." }, "INVALID", AV.dateNotAccepted],
    ["no fare profile upstream", 400, { success: false, error: "No valid Profile found for this Train, Date and Station." }, "SOURCE_UNAVAILABLE", AV.couldNotAnswer],
    ["the generic upstream failure 12951 answers with", 400, { success: false, error: "Unable to process your request" }, "SOURCE_UNAVAILABLE", AV.couldNotAnswer],
    ["a past date, which cannot be read at all", 400, { success: false, error: "Failed to fetch availability" }, "SOURCE_UNAVAILABLE", AV.couldNotAnswer],
    ["a refusal nobody has measured", 409, { success: false, error: "Request could not be completed." }, "SOURCE_UNAVAILABLE", AV.couldNotAnswer],
  ] as const;

  it.each(REFUSALS)("%s", async (_label, status, body, code, message) => {
    const out = await sourceWith(async () => response(status, body)).check(REQUEST);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe(code);
    expect(out.code).not.toBe("NOT_FOUND");
    expect(out.message).toBe(message);
    expect(out.message).not.toBe(OUT.noRecord);
    expectNotAnEmptyAnswer(out);
  });

  it.each(REFUSALS)("%s names no provider, key, plan or HTTP status", async (_label, status, body) => {
    const out = await sourceWith(async () => response(status, body)).check(REQUEST);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).not.toMatch(/railkit|rapid|irctcapi|api key|plan|quota|400|401|403|409|429|500|http/i);
  });
});

describe("every transport failure reads as unavailable", () => {
  const FAILURES = [
    ["the key or plan refused, 401", async () => response(401, { success: false, error: "Unauthorized" }), OUT.refused, "refused"],
    ["the key or plan refused, 403", async () => response(403, { success: false, error: "Forbidden" }), OUT.refused, "refused"],
    ["the rate limit or quota, 429", async () => response(429, { success: false, error: "Too many requests" }, { "ratelimit-reset": "42" }), OUT.busy, "quota"],
    ["the provider broke, 500", async () => response(500, { success: false, error: "Internal error" }), OUT.error, "server"],
    ["a body that is not JSON", async () => response(200, "<html>gateway</html>"), OUT.unreadable, "unreadable"],
    ["a timeout", timedOut, OUT.timeout, "timeout"],
    ["an unreachable host", unreachable, OUT.unreachable, "network"],
  ] as const;

  it.each(FAILURES)("%s", async (_label, fetchImpl, message, cause) => {
    const out = await sourceWith(fetchImpl).check(REQUEST);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
    expect(out.message).toBe(message);
    expect(out.cause).toBe(cause);
    expectNotAnEmptyAnswer(out);
  });

  it("carries the rate-limit reset so the breaker can rest for exactly that long", async () => {
    const out = await sourceWith(async () => response(429, { success: false, error: "Too many requests" }, { "retry-after": "17" })).check(REQUEST);
    expect(out).toMatchObject({ ok: false, cause: "quota", retryAfter: 17 });
  });

  it("tells the transport failures apart without ever saying no record", () => {
    const said = FAILURES.map(([, , message]) => message);
    expect(new Set(said).size).toBe(6);
    expect(said).not.toContain(OUT.noRecord);
  });
});

describe("the key never leaves the server", () => {
  it("keeps the key out of the URL and out of every message", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => response(200, OK_BODY));
    const out = await sourceWith(fetchMock).check(REQUEST);
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain(CONFIG.key);
    expect(JSON.stringify(out)).not.toContain(CONFIG.key);
  });
});
