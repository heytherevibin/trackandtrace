import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";
import { MemoryCache } from "@/services/cache";
import { UNLIMITED_BUDGET } from "@/services/live-budget";
import { queryPnr } from "@/services/pnr-query";
import { MemoryRateLimiter } from "@/services/rate-limit";
import { singleFlight } from "@/services/single-flight";
import { createRailkitSource } from "@/services/sources/railkit";
import type { PnrDataSource } from "@/services/pnr-source";
import type { PnrOutcome } from "@/types/domain";

// ---------------------------------------------------------------------------
// One source and no fallback is not a hypothetical: it is what this deployment runs, and it is
// what `PNR_FALLBACK` can be set to (see src/services/env.ts). So "the source cannot answer"
// stops being an edge case and becomes the failure mode. The one thing this product must never
// do is turn it into "there is no such reservation": a traveller told their ticket does not
// exist acts on it.
//
// So every way RailKit can fail is pinned here twice — once at the adapter, once through the
// query the API route calls — and the boundary is pinned too: a refusal only reads as "no
// record" when it says so about the PNR. Real adapters, not stubs. What a second source behind
// it would change is the subject of tests/unit/services/sources/fallback.test.ts.
// ---------------------------------------------------------------------------

const PNR = "4949608635";
const IP = "1.1.1.1";
const NOW = new Date("2026-09-23T06:30:00.000Z");
const OUT = messages.source.outcomes;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function railkit(fetchImpl: () => Promise<Response>): PnrDataSource {
  return createRailkitSource(
    { key: "railkit_0123456789abcdef0123456789abcdef", baseUrl: "https://api.railkit.in", timeoutMs: 8_000 },
    { fetch: fetchImpl as unknown as typeof fetch, now: () => NOW },
  );
}

const timedOut = () => Promise.reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
const unreachable = () => Promise.reject(new TypeError("fetch failed"));

/** Every way the only source can fail, and the sentence each puts in front of a traveller. */
const FAILURES = [
  ["HTTP 401, the key refused", async () => json(401, { success: false, error: "Unauthorized" }), OUT.refused],
  ["HTTP 403, the plan refused", async () => json(403, { success: false, error: "Forbidden" }), OUT.refused],
  ["HTTP 429, the rate limit or quota", async () => json(429, { success: false, error: "Too many requests" }, { "ratelimit-reset": "42" }), OUT.busy],
  ["HTTP 500, the provider broke", async () => json(500, { success: false, error: "Internal error" }), OUT.error],
  ["a timeout", timedOut, OUT.timeout],
  ["an unreachable host", unreachable, OUT.unreachable],
] as const;

beforeEach(() => {
  // The server log is the subject of its own tests; here it only has to stay out of the run.
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("the only source cannot answer", () => {
  it.each(FAILURES)("%s reads as unavailable, never as no record", async (_label, fetchImpl, expected) => {
    const out = await railkit(fetchImpl).check(PNR);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
    expect(out.code).not.toBe("NOT_FOUND");
    expect(out.message).toBe(expected);
    expect(out.message).not.toBe(OUT.noRecord);
  });

  it.each(FAILURES)("%s reaches the browser as SOURCE_UNAVAILABLE, not NOT_FOUND", async (_label, fetchImpl, expected) => {
    const out = await queryPnr(PNR, IP, {
      deps: {
        source: railkit(fetchImpl),
        limiter: new MemoryRateLimiter(),
        cache: new MemoryCache(),
        flight: singleFlight<PnrOutcome>(),
        budget: UNLIMITED_BUDGET,
        now: () => Date.now(),
      },
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("SOURCE_UNAVAILABLE");
    expect(out.error.message).toBe(expected);
  });

  it.each(FAILURES)("%s names no provider, key, plan or HTTP status to the traveller", async (_label, fetchImpl) => {
    const out = await railkit(fetchImpl).check(PNR);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).not.toMatch(/railkit|rapid|irctcapi|api key|plan|quota|401|403|429|500|http/i);
  });

  it("tells the six failures apart in five sentences — only a refused key and a refused plan share one", () => {
    const said = FAILURES.map(([, , message]) => message);
    expect(said).toHaveLength(6);
    expect(new Set(said).size).toBe(5);
    expect(said).not.toContain(OUT.noRecord);
  });
});

describe("the boundary: what may read as no record", () => {
  it("passes RailKit's genuine no-record refusal through as NOT_FOUND", async () => {
    const out = await railkit(async () => json(400, { success: false, error: "No PNR data found or invalid PNR number" })).check(PNR);
    expect(out).toMatchObject({ ok: false, code: "NOT_FOUND", message: OUT.noRecord });
  });

  it.each([
    ["an expired plan", 402, "Your plan has expired. Upgrade to continue."],
    ["a spent allowance", 400, "Monthly quota exceeded for your API key."],
    ["a rejected key", 400, "Invalid API key."],
    ["a billing hold", 402, "Payment required before this request can be served."],
    ["a refusal it says nothing about", 409, "Request could not be completed."],
  ])("fails closed on %s — a refusal that is not about the PNR is not a missing record", async (_label, status, error) => {
    const out = await railkit(async () => json(status, { success: false, error })).check(PNR);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
    expect(out.message).toBe(OUT.couldNotAnswer);
  });
});
