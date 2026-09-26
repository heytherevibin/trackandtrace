import { describe, expect, it, vi } from "vitest";
import { MemoryKv } from "@/services/kv";
import type { RateLimiter } from "@/services/rate-limit";
import { queryTrainRoute, TRAIN_ROUTE_TTL_MS, type TrainRouteQueryDeps } from "@/services/train-route-query";
import type { TrainRouteAnswer, TrainRouteSource } from "@/services/train-route-source";

// The cache is the whole reason this feature is affordable: one provider request per TRAIN, and a
// search lists up to twelve. So the arithmetic is the thing asserted, not just the happy path.

const IP = "203.0.113.9";

const answer: TrainRouteAnswer = {
  trainNo: "12601",
  trainName: "MAS MAQ SF MAIL",
  stops: [
    { code: "MAS", name: "Mgr Chennai Ctr", arrival: null, departure: "20:10", haltMinutes: 0, distanceKm: 0, day: 1, platform: 5 },
    { code: "MAQ", name: "Mangalore Central", arrival: "12:06", departure: null, haltMinutes: 0, distanceKm: 889, day: 2, platform: 4 },
  ],
  retrievedAt: "2026-09-26T04:00:00.000Z",
};

const ALLOW_ALL: RateLimiter = { check: () => ({ ok: true, remaining: 19, retryAfterSeconds: 0 }) };

function setup(over: Partial<TrainRouteQueryDeps> = {}) {
  const calls: string[] = [];
  const source: TrainRouteSource = {
    async check(request) {
      calls.push(request.trainNo);
      return { ok: true, answer };
    },
  };
  const kv = new MemoryKv();
  return { calls, kv, deps: { limiter: ALLOW_ALL, source, kv, prefix: "tt:test", ...over } satisfies TrainRouteQueryDeps };
}

describe("asking for one train's run", () => {
  it("asks the provider once and serves every later reader from the store", async () => {
    const { calls, deps } = setup();
    const first = await queryTrainRoute("12601", IP, deps);
    expect(first.cached).toBe(false);
    const second = await queryTrainRoute("12601", IP, deps);
    // The second reader of a popular train costs the provider nothing. Without this the feature is
    // one request per train per reader, which a list of twelve cannot afford.
    expect(second.cached).toBe(true);
    expect(calls).toEqual(["12601"]);
    if (!second.outcome.ok) throw new Error("expected an answer");
    expect(second.outcome.answer.stops).toHaveLength(2);
  });

  it("holds a run for a day, because a timetable is not a live reading", async () => {
    const set = vi.fn(async () => {});
    const kv = Object.assign(new MemoryKv(), { set });
    const { deps } = setup({ kv });
    await queryTrainRoute("12601", IP, deps);
    // Availability changes by the minute and is held for sixty seconds; this must never borrow
    // that number, nor lend this one.
    expect(set).toHaveBeenCalledWith("tt:test:trainroute:12601", expect.any(String), TRAIN_ROUTE_TTL_MS);
  });

  it("never caches a refusal, which would hold an outage for a day", async () => {
    const source: TrainRouteSource = { async check() { return { ok: false, code: "SOURCE_UNAVAILABLE", message: "nope", cause: "server" }; } };
    const { kv, deps } = setup({ source });
    await queryTrainRoute("12601", IP, deps);
    expect(await kv.get("tt:test:trainroute:12601")).toBeNull();
  });

  it("serves a cached run even to a reader the limiter would refuse", async () => {
    const refuse: RateLimiter = { check: () => ({ ok: false, remaining: 0, retryAfterSeconds: 30 }) };
    const { kv, deps } = setup();
    await queryTrainRoute("12601", IP, deps);
    // The limiter guards the PROVIDER. Rationing an answer that costs nothing would only punish
    // the reader for someone else's traffic.
    const again = await queryTrainRoute("12601", IP, { ...deps, limiter: refuse, kv });
    expect(again.outcome.ok).toBe(true);
    expect(again.cached).toBe(true);
  });

  it("refuses an uncached reader over the limit, rather than spending a request", async () => {
    const refuse: RateLimiter = { check: () => ({ ok: false, remaining: 0, retryAfterSeconds: 30 }) };
    const { calls, deps } = setup({ limiter: refuse });
    const out = await queryTrainRoute("12601", IP, deps);
    expect(out.outcome).toMatchObject({ ok: false, code: "RATE_LIMITED", retryAfter: 30 });
    expect(calls).toEqual([]);
  });

  it("treats a stored run that lost its stops as a miss, not as an answer", async () => {
    const { calls, kv, deps } = setup();
    await kv.set("tt:test:trainroute:12601", JSON.stringify({ ...answer, stops: [] }), 1000);
    const out = await queryTrainRoute("12601", IP, deps);
    // An empty run would draw a train that calls nowhere. Asking again is the safe reading.
    expect(out.cached).toBe(false);
    expect(calls).toEqual(["12601"]);
  });

  it("asks again when the stored value cannot be read at all", async () => {
    const { calls, kv, deps } = setup();
    await kv.set("tt:test:trainroute:12601", "{not json", 1000);
    await queryTrainRoute("12601", IP, deps);
    expect(calls).toEqual(["12601"]);
  });
});
