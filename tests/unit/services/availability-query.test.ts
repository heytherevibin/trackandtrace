import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";
import type { AvailabilityRequest, AvailabilitySource } from "@/services/availability-source";
import { AVAILABILITY_RATE_LIMIT, queryAvailability } from "@/services/availability-query";
import { parseEnv, type Env } from "@/services/env";
import type { LiveBudget } from "@/services/live-budget";
import { MemoryRateLimiter } from "@/services/rate-limit";
import { resetLocalState } from "@/services/shared-store";
import { fixtureAvailabilitySource } from "@/services/sources/fixture-availability";
import { resolveAvailabilitySource } from "@/services/sources";

// ---------------------------------------------------------------------------
// The live availability ask, and the one property every layer of it exists to
// keep: NO PATH EVER ANSWERS `ok: true` WITH AN EMPTY DAY LIST. A traveller
// reads an empty answer as "no berths" and books elsewhere, so a limiter, a
// spent budget, a refused key and a provider outage must each come back as a
// failure — not as a journey with nothing in it.
// ---------------------------------------------------------------------------

const OUT = messages.source.outcomes;
const AV = messages.source.availability;

const JOURNEY: AvailabilityRequest = {
  trainNo: "12627",
  from: "SBC",
  to: "NDLS",
  journeyDate: "2026-10-15",
  travelClass: "3A",
  quota: "GN",
};

const SPENT: LiveBudget = { take: async () => ({ ok: false, retryAfterSeconds: 3_600 }), takeMany: async () => ({ ok: false, retryAfterSeconds: 3_600 }) };
const OPEN: LiveBudget = { take: async () => ({ ok: true }), takeMany: async () => ({ ok: true }) };
const NOTHING = async () => 0;

afterEach(() => resetLocalState());

function envOf(source: Record<string, string>): Env {
  const parsed = parseEnv(source);
  if (!parsed.ok) throw new Error(parsed.issues.join("; "));
  return parsed.env;
}

const ask = (overrides: Parameters<typeof queryAvailability>[2] = {}) =>
  queryAvailability(JOURNEY, "203.0.113.7", { limiter: new MemoryRateLimiter(), budget: OPEN, source: fixtureAvailabilitySource, record: NOTHING, ...overrides });

describe("queryAvailability", () => {
  it("answers a sample journey with its days", async () => {
    const { outcome } = await ask();
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.answer.days.length).toBeGreaterThan(0);
    expect(outcome.answer.train.no).toBe("12627");
  });

  it("never answers ok with an empty day list, whatever stopped the ask", async () => {
    const limiter = new MemoryRateLimiter();
    for (let i = 0; i < AVAILABILITY_RATE_LIMIT.limit; i += 1) await ask({ limiter });

    const refusals = [
      await ask({ limiter }), // over the per-caller limit
      await ask({ budget: SPENT }), // today's live budget is spent
      await ask({ source: { async check() { return { ok: false, code: "SOURCE_UNAVAILABLE", message: OUT.error, cause: "server" }; } } as AvailabilitySource }),
    ];

    for (const { outcome } of refusals) {
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome).not.toHaveProperty("answer");
      expect(outcome).not.toHaveProperty("days");
    }
  });

  it("stops at the limiter before the provider is asked", async () => {
    const limiter = new MemoryRateLimiter();
    const source = { check: vi.fn(fixtureAvailabilitySource.check) } as AvailabilitySource;
    for (let i = 0; i < AVAILABILITY_RATE_LIMIT.limit; i += 1) await ask({ limiter, source });
    const calls = (source.check as ReturnType<typeof vi.fn>).mock.calls.length;

    const { outcome } = await ask({ limiter, source });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("RATE_LIMITED");
    expect((source.check as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
  });

  it("stops at the daily budget before the provider is asked, and says so", async () => {
    const source = { check: vi.fn(fixtureAvailabilitySource.check) } as AvailabilitySource;
    const { outcome } = await ask({ budget: SPENT, source });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).toBe(OUT.dailyLimit);
    expect(source.check).not.toHaveBeenCalled();
  });

  it("records an answered journey as an observation, and serves it even when recording fails", async () => {
    const record = vi.fn().mockResolvedValue(1);
    const { outcome } = await ask({ record });
    expect(outcome.ok).toBe(true);
    expect(record).toHaveBeenCalledOnce();

    const broken = await ask({ record: vi.fn().mockRejectedValue(new Error("store is down")) });
    expect(broken.outcome.ok).toBe(true);
  });

  it("does not record a refusal: there is nothing to learn from a question that was not asked", async () => {
    const record = vi.fn();
    await ask({ budget: SPENT, record });
    expect(record).not.toHaveBeenCalled();
  });
});

describe("the fixture's drawn states", () => {
  it("gives a queue that moves, and a departure-day row that cannot be joined", async () => {
    const moving = await fixtureAvailabilitySource.check(JOURNEY);
    expect(moving.ok).toBe(true);
    if (!moving.ok) return;
    const waitlisted = moving.answer.days.filter((d) => d.wlCurrent !== null);
    expect(waitlisted.length).toBeGreaterThan(1);
    expect(new Set(waitlisted.map((d) => d.wlCurrent)).size).toBeGreaterThan(1);

    // 22691 arrives at NZM, not NDLS. The pair has to be its own — the fixture used to ignore the
    // stations entirely, which is how the route fan-out shipped asking every train about the pair
    // the traveller typed.
    const closed = await fixtureAvailabilitySource.check({ ...JOURNEY, trainNo: "22691", to: "NZM" });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.answer.days.some((d) => !d.canBook && d.status === "WAITLIST")).toBe(true);
  });

  it("refuses a train asked about a pair it does not serve", async () => {
    // What the real provider does, and what this fixture did not do until 2026-09-25.
    const wrongPair = await fixtureAvailabilitySource.check({ ...JOURNEY, trainNo: "22691" });
    expect(wrongPair.ok).toBe(false);
    if (wrongPair.ok) return;
    expect(wrongPair).not.toHaveProperty("days");
  });

  it("refuses a train it has no sample for, rather than answering with no days", async () => {
    const out = await fixtureAvailabilitySource.check({ ...JOURNEY, trainNo: "12345" });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toBe(AV.couldNotAnswer);
    expect(out).not.toHaveProperty("answer");
  });
});

describe("resolveAvailabilitySource", () => {
  it("refuses sample data in production even when the env guard is bypassed", async () => {
    const forced: Env = { ...envOf({ NODE_ENV: "development", PNR_SOURCE: "fixture" }), NODE_ENV: "production" };
    const out = await resolveAvailabilitySource(forced).check(JOURNEY);
    expect(out.ok).toBe(false);
  });

  it("says it could not ask, never an empty journey, when the deployment holds no key", async () => {
    const key = `railkit_${"0123456789abcdef".repeat(2)}`;
    const keyless: Env = { ...envOf({ NODE_ENV: "development", PNR_SOURCE: "railkit", RAILKIT_API_KEY: key }), RAILKIT_API_KEY: "" };
    const out = await resolveAvailabilitySource(keyless).check(JOURNEY);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toBe(AV.couldNotAnswer);
    expect(out).not.toHaveProperty("answer");
  });
});
