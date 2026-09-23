import { describe, expect, it } from "vitest";
import { messages } from "@/messages";
import type { Admission, Breaker, Recordable } from "@/services/breaker";
import type { AvailabilityOutcome, AvailabilityRequest, AvailabilitySource } from "@/services/availability-source";
import type { PnrDataSource } from "@/services/pnr-source";
import { buildFixtureResult } from "@/services/sources/fixture";
import { createGuardedSource, isSafeToRetry, retryDelayMs } from "@/services/sources/guarded";
import { unavailable, type SourceOutcome } from "@/services/sources/outcome";

const PNR = "2345678901";
const OK = buildFixtureResult(PNR);
const OUT = messages.source.outcomes;

function guard(answers: readonly SourceOutcome[], options: { readonly gate?: Admission; readonly elapsedPerRead?: number } = {}) {
  const calls = { provider: 0, counted: 0 };
  const delays: number[] = [];
  const recorded: Recordable[] = [];
  const clock = { now: 0 };
  const source: PnrDataSource = {
    async check() {
      calls.provider += 1;
      return answers[Math.min(calls.provider - 1, answers.length - 1)];
    },
  };
  const breaker: Breaker = {
    admit: async () => options.gate ?? { open: false },
    record: async (outcome) => {
      recorded.push(outcome);
    },
  };
  const guarded = createGuardedSource(source, {
    breaker,
    countRequest: async () => {
      calls.counted += 1;
    },
    sleep: async (ms) => {
      delays.push(ms);
    },
    random: () => 0.5,
    now: () => {
      const read = clock.now;
      clock.now += options.elapsedPerRead ?? 0;
      return read;
    },
  });
  return { guarded, calls, delays, recorded };
}

describe("the guarded source", () => {
  it("asks nothing of the provider while the breaker is open", async () => {
    const { guarded, calls, recorded } = guard([OK], { gate: { open: true, retryAfterSeconds: 42 } });
    await expect(guarded.check(PNR)).resolves.toEqual({ ok: false, code: "SOURCE_UNAVAILABLE", message: OUT.resting, retryAfter: 42 });
    expect(calls).toEqual({ provider: 0, counted: 0 });
    expect(recorded).toEqual([]);
  });

  it("retries a network failure once, after 200–500 ms, and counts both requests", async () => {
    const { guarded, calls, delays, recorded } = guard([unavailable(OUT.unreachable, "network"), OK]);
    await expect(guarded.check(PNR)).resolves.toEqual(OK);
    expect(calls).toEqual({ provider: 2, counted: 2 });
    expect(delays).toEqual([350]);
    expect(recorded).toEqual([OK]);
  });

  it.each([502, 503, 504])("retries HTTP %i once", async (status) => {
    const { guarded, calls } = guard([unavailable(OUT.error, "server", { status }), OK]);
    await expect(guarded.check(PNR)).resolves.toEqual(OK);
    expect(calls.provider).toBe(2);
  });

  it.each([
    ["HTTP 500", unavailable(OUT.error, "server", { status: 500 })],
    ["a quota refusal", unavailable(OUT.busy, "quota", { status: 429 })],
    ["a refused key", unavailable(OUT.refused, "refused", { status: 401 })],
    ["a timeout", unavailable(OUT.timeout, "timeout")],
    ["an unreadable answer", unavailable(OUT.unreadable, "unreadable")],
  ])("never retries %s", async (_label, failure) => {
    const { guarded, calls, delays, recorded } = guard([failure, OK]);
    await expect(guarded.check(PNR)).resolves.toEqual(failure);
    expect(calls.provider).toBe(1);
    expect(delays).toEqual([]);
    expect(recorded).toEqual([failure]);
  });

  it("never retries once 3 seconds have passed", async () => {
    const failure = unavailable(OUT.unreachable, "network");
    const { guarded, calls } = guard([failure, OK], { elapsedPerRead: 3_500 });
    await expect(guarded.check(PNR)).resolves.toEqual(failure);
    expect(calls.provider).toBe(1);
  });

  it("tells the breaker only the final answer", async () => {
    const first = unavailable(OUT.unreachable, "network");
    const second = unavailable(OUT.error, "server", { status: 503 });
    const { guarded, recorded } = guard([first, second]);
    await guarded.check(PNR);
    expect(recorded).toEqual([second]);
  });
});

describe("the guarded source, around a source that is not about PNRs", () => {
  const ASK: AvailabilityRequest = { trainNo: "12951", from: "MMCT", to: "NDLS", journeyDate: "2026-10-01", travelClass: "SL", quota: "GN" };
  const ANSWER: AvailabilityOutcome = {
    ok: true,
    answer: {
      train: { no: "12951", name: "MMCT NDLS RAJDHANI", fromName: "MUMBAI CENTRAL", toName: "NEW DELHI", distanceKm: 1384 },
      fare: { base: 1000, reservation: 40, superfast: 45, gst: 0, total: 1085 },
      days: [],
      retrievedAt: "2026-09-23T00:00:00.000Z",
    },
  };

  function availabilityGuard(answer: AvailabilityOutcome, gate?: Admission) {
    const asked: AvailabilityRequest[] = [];
    const recorded: Recordable[] = [];
    const source: AvailabilitySource = {
      async check(request) {
        asked.push(request);
        return answer;
      },
    };
    const breaker: Breaker = { admit: async () => gate ?? { open: false }, record: async (outcome) => void recorded.push(outcome) };
    return { guarded: createGuardedSource(source, { breaker, countRequest: async () => {} }), asked, recorded };
  }

  it("passes the request through and tells the breaker the answer", async () => {
    const { guarded, asked, recorded } = availabilityGuard(ANSWER);
    await expect(guarded.check(ASK)).resolves.toEqual(ANSWER);
    expect(asked).toEqual([ASK]);
    expect(recorded).toEqual([ANSWER]);
  });

  it("asks nothing of the provider while its fuse is open, and answers in the shared failure shape", async () => {
    const { guarded, asked, recorded } = availabilityGuard(ANSWER, { open: true, retryAfterSeconds: 42 });
    await expect(guarded.check(ASK)).resolves.toEqual({ ok: false, code: "SOURCE_UNAVAILABLE", message: OUT.resting, retryAfter: 42 });
    expect(asked).toEqual([]);
    expect(recorded).toEqual([]);
  });
});

describe("the retry policy", () => {
  it("retries only network failures and 502, 503 and 504", () => {
    expect(isSafeToRetry(unavailable(OUT.unreachable, "network"))).toBe(true);
    expect(isSafeToRetry(unavailable(OUT.error, "server", { status: 503 }))).toBe(true);
    expect(isSafeToRetry(unavailable(OUT.error, "server", { status: 500 }))).toBe(false);
    expect(isSafeToRetry(OK)).toBe(false);
    expect(isSafeToRetry({ ok: false, code: "NOT_FOUND", message: "none" })).toBe(false);
  });

  it("waits between 200 and 500 ms", () => {
    expect(retryDelayMs(() => 0)).toBe(200);
    expect(retryDelayMs(() => 0.999)).toBe(500);
  });
});
