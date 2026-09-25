import { describe, expect, it, vi } from "vitest";
import type { AvailabilityRequest, AvailabilitySource } from "@/services/availability-source";
import { CLASS_EXPAND_RATE_LIMIT, queryAvailabilityClasses } from "@/services/availability-query";
import type { LiveBudget } from "@/services/live-budget";
import type { RateLimiter } from "@/services/rate-limit";

// Opening a row: one train, the classes the search did not ask for. It pays the limit and the
// budget once for the whole expand, exactly as the search does — looping the single-class ask would
// take the per-ask limit and a budget unit per class, which is the double-counting the fan-out
// exists to remove.

const JOURNEY = { trainNo: "12627", from: "SBC", to: "NDLS", journeyDate: "2026-10-16", quota: "GN" } as const;
const IP = "203.0.113.7";

function answerFor(request: AvailabilityRequest) {
  return {
    train: { no: request.trainNo, name: "KARNATAKA EXP", fromName: "KSR Bengaluru", toName: "New Delhi", distanceKm: 2444 },
    fare: { base: 765, reservation: 0, superfast: 0, gst: 0, total: 765 },
    days: [
      { date: "2026-10-16", status: "AVAILABLE", availabilityText: "AVAILABLE-0037", rawStatus: "AVAILABLE-0037", canBook: true, wlBooking: null, wlCurrent: null, seats: null, prediction: null, predictionPercentage: null },
    ],
    retrievedAt: "2026-10-16T08:39:00.000Z",
  };
}

function countingSource(failFor: readonly string[] = []) {
  const calls: AvailabilityRequest[] = [];
  const source: AvailabilitySource = {
    async check(request) {
      calls.push(request);
      if (failFor.includes(request.travelClass)) return { ok: false, code: "SOURCE_UNAVAILABLE", message: "nope", cause: "server" };
      return { ok: true, answer: answerFor(request) };
    },
  };
  return { calls, source };
}

const ALLOW_ALL: RateLimiter = { check: () => ({ ok: true, remaining: 9, retryAfterSeconds: 0 }) };
const OPEN: LiveBudget = { take: async () => ({ ok: true }), takeMany: async () => ({ ok: true }) };

const ask = (classes: readonly string[], over = {}) => {
  const { calls, source } = countingSource();
  return { calls, run: queryAvailabilityClasses(JOURNEY, classes, IP, { limiter: ALLOW_ALL, budget: OPEN, source, record: async () => 0, ...over }) };
};

describe("opening a train's remaining classes", () => {
  it("asks once per class and answers them all", async () => {
    const { calls, run } = ask(["3A", "2A"]);
    const { answers } = await run;
    expect(calls).toHaveLength(2);
    expect(Object.keys(answers)).toEqual(["3A", "2A"]);
  });

  it("reserves the whole expand in one decision", async () => {
    const takeMany = vi.fn(async () => ({ ok: true }) as const);
    await ask(["3A", "2A"], { budget: { take: async () => ({ ok: true }), takeMany } }).run;
    expect(takeMany).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("refuses the whole expand before asking anything when the budget cannot cover it", async () => {
    const { calls, run } = ask(["3A", "2A"], { budget: { take: async () => ({ ok: true }), takeMany: async () => ({ ok: false, retryAfterSeconds: 1800 }) } });
    const { outcome } = await run;
    expect(outcome).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE", retryAfter: 1800 });
    expect(calls).toHaveLength(0);
  });

  it("refuses before asking anything when the caller is rate limited", async () => {
    const { calls, run } = ask(["3A"], { limiter: { check: () => ({ ok: false, remaining: 0, retryAfterSeconds: 30 }) } });
    const { outcome } = await run;
    expect(outcome).toMatchObject({ ok: false, code: "RATE_LIMITED", retryAfter: 30 });
    expect(calls).toHaveLength(0);
  });

  it("keeps the classes that answered when one of them fails", async () => {
    const { source } = countingSource(["2A"]);
    const { answers, failedClasses } = await queryAvailabilityClasses(JOURNEY, ["3A", "2A"], IP, {
      limiter: ALLOW_ALL,
      budget: OPEN,
      source,
      record: async () => 0,
    });
    // One class that could not be answered must not cost the other its answer, and the failure is
    // named rather than left as an absence — an absent class reads as "not carried".
    expect(Object.keys(answers)).toEqual(["3A"]);
    expect(failedClasses).toEqual(["2A"]);
  });

  it("records every answer it served, and serves them even when recording throws", async () => {
    const record = vi.fn(async () => {
      throw new Error("store down");
    });
    const { calls, source } = countingSource();
    const { answers } = await queryAvailabilityClasses(JOURNEY, ["3A", "2A"], IP, { limiter: ALLOW_ALL, budget: OPEN, source, record });
    expect(calls).toHaveLength(2);
    expect(Object.keys(answers)).toHaveLength(2);
    expect(record).toHaveBeenCalledTimes(2);
  });

  it("allows a whole list to be read without waiting", () => {
    // Thirty a minute: eight rows of two classes each, opened back to back, with room to spare.
    expect(CLASS_EXPAND_RATE_LIMIT).toEqual({ limit: 30, windowMs: 60_000 });
  });
});
