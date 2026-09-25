import { describe, expect, it, vi } from "vitest";
import type { AvailabilityAnswer, AvailabilityOutcome, AvailabilityRequest, AvailabilitySource } from "@/services/availability-source";
import type { LiveBudget } from "@/services/live-budget";
import type { RateLimiter } from "@/services/rate-limit";
import {
  queryRouteAvailability,
  ROUTE_AVAILABILITY_MAX_ASKS,
  ROUTE_AVAILABILITY_MAX_TRAINS,
  ROUTE_AVAILABILITY_RATE_LIMIT,
  type RouteAvailabilityQueryDeps,
} from "@/services/route-availability-query";
import type { RouteOutcome, RouteTrain } from "@/services/route-source";

// The fan-out: one route request, then the FIRST chosen class for every train it returned.
//
// The arithmetic this file exists to hold is the spec's headline — nine requests for a search of
// eight trains, not twenty-five — and a passing suite would not otherwise prove it. So the source
// is a counter, and the count itself is asserted.
//
// The other load-bearing rule is inherited from both seams underneath: **a refusal is never an
// empty list.** `trains: []` is an ANSWER ("no trains run that pair") and must come back ok.

const IP = "203.0.113.7";

/**
 * A train on the pair, with its OWN boarding and alighting codes.
 *
 * These are usually not the pair the traveller typed. "Bengaluru to Delhi" is served from SBC and
 * from YPR, and arrives at NDLS, NZM, DEE or TKD — production answers SBC → NDLS with eight trains
 * of which seven call at none of those two stations.
 */
function train(trainNo: string, fromCode = "YPR", toCode = "NZM"): RouteTrain {
  return {
    trainNo,
    trainName: `TRAIN ${trainNo}`,
    fromCode,
    fromName: fromCode,
    toCode,
    toName: toCode,
    originCode: "SBC",
    originName: "KSR Bengaluru",
    destinationCode: "NDLS",
    destinationName: "New Delhi",
    departs: "19:20",
    arrives: "09:00",
    travelTime: "37h 40m",
    runningDays: "1111111",
    runsOn: [true, true, true, true, true, true, true],
    halts: 34,
    distanceKm: 2444,
  };
}

const EIGHT = ["12649", "12629", "22685", "12627", "22691", "12647", "12213", "00629"].map((no) => train(no));

function answer(request: AvailabilityRequest): AvailabilityAnswer {
  return {
    train: { no: request.trainNo, name: `TRAIN ${request.trainNo}`, fromName: "KSR Bengaluru", toName: "New Delhi", distanceKm: 2444 },
    fare: { base: 765, reservation: 0, superfast: 0, gst: 0, total: 765 },
    days: [
      { date: "2026-10-16", status: "WL", availabilityText: "GNWL136/WL44", rawStatus: "GNWL136/WL44", canBook: true, wlBooking: 136, wlCurrent: 44, seats: null, prediction: null, predictionPercentage: null },
    ],
    retrievedAt: "2026-10-16T08:39:00.000Z",
  };
}

/** A source that records every ask, and can be told which trains to refuse. */
function countingSource(failFor: readonly string[] = [], notCarriedFor: readonly string[] = []) {
  const calls: AvailabilityRequest[] = [];
  const source: AvailabilitySource = {
    async check(request): Promise<AvailabilityOutcome> {
      calls.push(request);
      // A train that does not carry the class comes back INVALID, not SOURCE_UNAVAILABLE — the
      // provider says so distinctly and the breaker ignores it. Measured 2026-09-25.
      if (notCarriedFor.includes(request.trainNo)) {
        return { ok: false, code: "INVALID", message: "This train does not carry that class." };
      }
      if (failFor.includes(request.trainNo)) {
        return { ok: false, code: "SOURCE_UNAVAILABLE", message: "nope", cause: "server" };
      }
      return { ok: true, answer: answer(request) };
    },
  };
  return { calls, source };
}

function routeReturning(trains: readonly RouteTrain[]) {
  const calls: Array<{ from: string; to: string }> = [];
  const route = async (from: string, to: string): Promise<RouteOutcome> => {
    calls.push({ from, to });
    return { ok: true, answer: { from, to, trains, retrievedAt: "2026-09-25T09:00:00.000Z" } };
  };
  return { calls, route };
}

const ALLOW_ALL: RateLimiter = { check: () => ({ ok: true, remaining: 5, retryAfterSeconds: 0 }) };
const OPEN: LiveBudget = { take: async () => ({ ok: true }), takeMany: async () => ({ ok: true }) };

function setup(over: Partial<RouteAvailabilityQueryDeps> = {}) {
  const { calls, source } = countingSource();
  const { route } = routeReturning(EIGHT);
  return {
    calls,
    deps: { limiter: ALLOW_ALL, budget: OPEN, source, route, record: async () => 0, ...over } satisfies RouteAvailabilityQueryDeps,
  };
}

const REQUEST = { from: "SBC", to: "NDLS", journeyDate: "2026-10-16", quota: "GN", classes: ["SL", "3A", "2A"] } as const;

describe("asking a whole route", () => {
  it("asks every chosen class of every train, and nothing more", async () => {
    const { calls, deps } = setup();
    const { outcome } = await queryRouteAvailability(REQUEST, IP, deps);
    expect(outcome.ok).toBe(true);
    // Eight trains, three classes: twenty-four asks plus the route lookup above them. The list
    // shows every class the reader chose, so every class the reader chose has to be asked.
    expect(calls).toHaveLength(24);
    expect(new Set(calls.map((c) => c.travelClass))).toEqual(new Set(["2A", "3A", "SL"]));
  });

  it("leaves nothing pending once a search has answered", async () => {
    const { deps } = setup();
    const { outcome } = await queryRouteAvailability(REQUEST, IP, deps);
    if (!outcome.ok) throw new Error("expected an answer");
    // Every chosen class is in hand, so opening a row costs nothing: the other three dates came
    // back with the first ask and are already in the payload.
    expect(outcome.answer.rows.every((r) => r.pending.length === 0)).toBe(true);
    expect(Object.keys(outcome.answer.rows[0]!.answers)).toEqual(["2A", "3A", "SL"]);
  });

  it("caps the asks, not just the trains", async () => {
    const many = Array.from({ length: 20 }, (_, i) => train(String(10000 + i)));
    const { calls, deps } = setup({ route: routeReturning(many).route });
    const { outcome } = await queryRouteAvailability({ ...REQUEST, classes: ["SL", "3A", "2A", "1A"] }, IP, deps);
    if (!outcome.ok) throw new Error("expected an answer");
    // Twenty trains times four classes is eighty asks on one click. The cap is on the TOTAL, and
    // it drops whole trains rather than classes, so every row that was asked carries the same
    // columns and the list stays rankable.
    expect(calls.length).toBeLessThanOrEqual(ROUTE_AVAILABILITY_MAX_ASKS);
    const asked = outcome.answer.rows.filter((r) => !r.beyondCap);
    expect(asked.every((r) => Object.keys(r.answers).length === 4)).toBe(true);
    expect(outcome.answer.rows).toHaveLength(20);
  });

  it("asks each train about the stations THAT train calls at", async () => {
    const { calls, deps } = setup({ route: routeReturning([train("12649", "YPR", "NZM"), train("12627", "SBC", "NDLS")]).route });
    await queryRouteAvailability(REQUEST, IP, deps);
    // Not the pair the traveller typed. "Bengaluru to Delhi" is served from SBC and from YPR and
    // arrives at NDLS, NZM, DEE or TKD; asking every train about SBC → NDLS refuses for all but the
    // one that happens to run it. Production answered exactly that way: seven of eight failed.
    expect([...new Set(calls.map((c) => `${c.trainNo} ${c.from}→${c.to}`))]).toEqual(["12649 YPR→NZM", "12627 SBC→NDLS"]);
  });

  it("asks the classes in the enum's order, whatever order they were named in", async () => {
    const { calls, deps } = setup();
    // Given in the order a reader might click them. The asks come back 2A, 3A, SL per train,
    // because the enum declares them that way — so two readers who picked the same three see the
    // same columns in the same places.
    await queryRouteAvailability({ ...REQUEST, classes: ["SL", "3A", "2A"] }, IP, deps);
    // Per train: the pool runs four trains at once, so the call log interleaves across them.
    expect(calls.filter((c) => c.trainNo === "12627").map((c) => c.travelClass)).toEqual(["2A", "3A", "SL"]);
  });

  it("still names a lead class, because the list is ranked by one of them", async () => {
    const { deps } = setup();
    const { outcome } = await queryRouteAvailability(REQUEST, IP, deps);
    if (!outcome.ok) throw new Error("expected an answer");
    // Every class is now asked, but sorting by fare and filtering to what can be booked still need
    // ONE class to rank by, or rows would be compared on different things.
    expect(outcome.answer.leadClass).toBe("2A");
  });

  it("answers a pair with no trains, and that is not a refusal", async () => {
    const { route } = routeReturning([]);
    const { deps } = setup({ route });
    const { outcome } = await queryRouteAvailability(REQUEST, IP, deps);
    // "No trains run that pair" is a fact about the railway. A refusal would be read as
    // "nothing is available", which is a different thing a traveller acts on differently.
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.answer.rows).toEqual([]);
  });

  it("reserves nothing for a pair with no trains", async () => {
    const takeMany = vi.fn(async () => ({ ok: true }) as const);
    const { route } = routeReturning([]);
    const { deps } = setup({ route, budget: { take: async () => ({ ok: true }), takeMany } });
    await queryRouteAvailability(REQUEST, IP, deps);
    // Nothing is going to be asked, so nothing may be spent. A reservation here would burn a unit
    // of the day's budget on a question the railway already answered for free.
    expect(takeMany).not.toHaveBeenCalled();
  });

  it("keeps the list when one train's ask fails, and offers that class again", async () => {
    const { source } = countingSource(["22685"]);
    const { deps } = setup({ source });
    const { outcome } = await queryRouteAvailability(REQUEST, IP, deps);
    if (!outcome.ok) throw new Error("expected an answer");
    expect(outcome.answer.rows).toHaveLength(8);
    const failed = outcome.answer.rows.find((r) => r.train.trainNo === "22685")!;
    expect(failed.failed).toBe(true);
    expect(failed.answers).toEqual({});
    // The class that failed goes back in the queue, so opening the row can ask it again.
    // Dropping it would lose the lead class with no way to retry.
    expect(failed.pending).toEqual(["2A", "3A", "SL"]);
    // And one bad train costs no other train its answer.
    expect(outcome.answer.rows.filter((r) => !r.failed)).toHaveLength(7);
  });

  it("says a train does not carry the class, rather than calling the ask a failure", async () => {
    const { source } = countingSource([], ["22685"]);
    const { deps } = setup({ source });
    const { outcome } = await queryRouteAvailability(REQUEST, IP, deps);
    if (!outcome.ok) throw new Error("expected an answer");
    const row = outcome.answer.rows.find((r) => r.train.trainNo === "22685")!;
    // Not a failure: the provider answered, correctly and quickly, that this train carries none of
    // them. Calling it failed would say "we could not ask", which is a different thing, and would
    // put the classes back in the queue for a retry that can only be refused the same way again.
    expect(row.failed).toBe(false);
    expect(row.notCarried).toEqual(["2A", "3A", "SL"]);
    expect(row.pending).toEqual([]);
  });

  it("refuses the whole search before asking anything when the day's budget cannot cover it", async () => {
    const { calls, deps } = setup({ budget: { take: async () => ({ ok: true }), takeMany: async () => ({ ok: false, retryAfterSeconds: 1800 }) } });
    const { outcome } = await queryRouteAvailability(REQUEST, IP, deps);
    expect(outcome).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE", retryAfter: 1800 });
    expect(calls).toHaveLength(0);
  });

  it("reserves exactly as many units as it means to ask", async () => {
    const takeMany = vi.fn(async () => ({ ok: true }) as const);
    const { deps } = setup({ budget: { take: async () => ({ ok: true }), takeMany } });
    await queryRouteAvailability(REQUEST, IP, deps);
    expect(takeMany).toHaveBeenCalledExactlyOnceWith(24);
  });

  it("refuses before the route is asked when the caller is rate limited", async () => {
    const { calls: routeCalls, route } = routeReturning(EIGHT);
    const { calls, deps } = setup({ route, limiter: { check: () => ({ ok: false, remaining: 0, retryAfterSeconds: 42 }) } });
    const { outcome } = await queryRouteAvailability(REQUEST, IP, deps);
    expect(outcome).toMatchObject({ ok: false, code: "RATE_LIMITED", retryAfter: 42 });
    expect(routeCalls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("propagates a route lookup that could not be made", async () => {
    const { deps } = setup({ route: async () => ({ ok: false, code: "SOURCE_UNAVAILABLE", message: "no route" }) });
    const { outcome } = await queryRouteAvailability(REQUEST, IP, deps);
    expect(outcome).toMatchObject({ ok: false, message: "no route" });
  });

  it("caps the fan-out, and says which trains it did not ask", async () => {
    const many = Array.from({ length: 20 }, (_, i) => train(String(10000 + i)));
    const { route } = routeReturning(many);
    const { calls, deps } = setup({ route });
    const { outcome } = await queryRouteAvailability(REQUEST, IP, deps);
    if (!outcome.ok) throw new Error("expected an answer");
    expect(calls).toHaveLength(ROUTE_AVAILABILITY_MAX_TRAINS * 3);
    // Every train is still LISTED; the cap changes what was asked, not what runs.
    expect(outcome.answer.rows).toHaveLength(20);
    const beyond = outcome.answer.rows.filter((r) => r.beyondCap);
    expect(beyond).toHaveLength(20 - ROUTE_AVAILABILITY_MAX_TRAINS);
    // Not asked is not the same as failed, and must not be reported as one.
    expect(beyond.every((r) => !r.failed && r.pending.length === 3 && r.notCarried.length === 0)).toBe(true);
  });

  it("never runs more than four asks at once", async () => {
    let live = 0;
    let peak = 0;
    const source: AvailabilitySource = {
      async check(request) {
        live += 1;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 1));
        live -= 1;
        return { ok: true, answer: answer(request) };
      },
    };
    const { deps } = setup({ source });
    await queryRouteAvailability(REQUEST, IP, deps);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it("records every answer it served", async () => {
    const record = vi.fn(async () => 4);
    const { deps } = setup({ record });
    await queryRouteAvailability(REQUEST, IP, deps);
    expect(record).toHaveBeenCalledTimes(24);
  });

  it("serves the answer even when recording throws", async () => {
    const record = vi.fn(async () => {
      throw new Error("store down");
    });
    const { deps } = setup({ record });
    const { outcome } = await queryRouteAvailability(REQUEST, IP, deps);
    // A store that is down must not cost anyone their answer.
    expect(outcome.ok).toBe(true);
  });

  it("refuses a request that names no class it can lead with", async () => {
    const { calls, deps } = setup();
    const { outcome } = await queryRouteAvailability({ ...REQUEST, classes: [] }, IP, deps);
    expect(outcome).toMatchObject({ ok: false, code: "INVALID" });
    expect(calls).toHaveLength(0);
  });

  it("keeps the limiter's own numbers", () => {
    expect(ROUTE_AVAILABILITY_RATE_LIMIT).toEqual({ limit: 6, windowMs: 60_000 });
  });
});
