import { afterEach, describe, expect, it, vi } from "vitest";
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

/** A fetch double that never settles on its own, but rejects like a real aborted fetch would. */
function stalledFetch(): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    })) as typeof fetch;
}

afterEach(() => {
  vi.useRealTimers();
});

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

  describe("a caller signal alongside the built-in deadline", () => {
    it("still aborts the request when the caller's signal aborts, before any timeout", async () => {
      const controller = new AbortController();
      const promise = apiRequest("/x", { signal: controller.signal }, schema, { fetchImpl: stalledFetch(), timeoutMs: 8_000 });
      controller.abort();
      const out = await promise;
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error.code).toBe("SOURCE_UNAVAILABLE");
    });

    it("aborts at the timeout and returns the unreachable error, without ever aborting the caller's own signal", async () => {
      // Force the manual fallback combination deterministically: both AbortSignal.any and
      // AbortSignal.timeout exist in this repo's test runtimes, so the default path would use a
      // native, unref'd timer that fake timers cannot fast-forward. Some jsdom builds genuinely
      // lack these statics, which is exactly the branch this exercises.
      const originalAny = AbortSignal.any;
      // @ts-expect-error -- test-only: simulate an environment without AbortSignal.any
      AbortSignal.any = undefined;
      vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
      try {
        const controller = new AbortController();
        const promise = apiRequest("/x", { signal: controller.signal }, schema, { fetchImpl: stalledFetch(), timeoutMs: 8_000 });
        await vi.advanceTimersByTimeAsync(8_000);
        const out = await promise;
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.error.code).toBe("SOURCE_UNAVAILABLE");
        expect(controller.signal.aborted).toBe(false);
      } finally {
        AbortSignal.any = originalAny;
      }
    });
  });
});
