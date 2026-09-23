import { describe, expect, it, vi } from "vitest";
import { BREAKER, createBreaker } from "@/services/breaker";
import { MemoryKv } from "@/services/kv";
import type { FailureCause, SourceOutcome } from "@/services/sources/outcome";

const BASE = "tt:test:breaker:railkit";

/** One provider, one store, one clock: the two fuses a caller pair actually shares. */
function railkit() {
  const clock = { now: 1_000_000 };
  const kv = new MemoryKv(() => clock.now);
  const fuse = (endpoint: string) => {
    const onChange = vi.fn();
    return { breaker: createBreaker(kv, { provider: BASE, endpoint: `${BASE}:${endpoint}` }, { onChange }), onChange };
  };
  return { fuse, tick: (ms: number) => { clock.now += ms; } };
}

function setup() {
  const { fuse, tick } = railkit();
  const { breaker, onChange } = fuse("pnr");
  return { breaker, onChange, tick };
}

const fail = (cause: FailureCause = "server", retryAfter?: number): SourceOutcome => ({
  ok: false,
  code: "SOURCE_UNAVAILABLE",
  message: "x",
  cause,
  ...(retryAfter === undefined ? {} : { retryAfter }),
});
const noRecord: SourceOutcome = { ok: false, code: "NOT_FOUND", message: "none" };
/** What a route crawler gets for a train that does not stop where it asked: our mistake, answered at once. */
const notOnRoute: SourceOutcome = { ok: false, code: "INVALID", message: "not an intermediate station" };
/** The widened record signature: a breaker is told only that the provider answered, never what it said. */
const answered = { ok: true } as const;

async function failTimes(breaker: ReturnType<typeof setup>["breaker"], n: number, cause: FailureCause = "server") {
  for (let i = 0; i < n; i += 1) await breaker.record(fail(cause));
}

describe("the circuit breaker", () => {
  it("stays closed through four failures in a minute; the fifth opens it for 30 s", async () => {
    const { breaker } = setup();
    await failTimes(breaker, 4);
    await expect(breaker.admit()).resolves.toEqual({ open: false });
    await breaker.record(fail("timeout"));
    await expect(breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 30 });
  });

  it("ignores answers from checks already in flight when it opened: a burst never escalates the window", async () => {
    const { breaker } = setup();
    await failTimes(breaker, 12);
    await breaker.record(fail("refused"));
    await expect(breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 30 });
  });

  it("counts timeouts, network errors, server errors and unreadable answers alike", async () => {
    const { breaker } = setup();
    for (const cause of ["timeout", "network", "server", "unreadable", "server"] as const) await breaker.record(fail(cause));
    await expect(breaker.admit()).resolves.toMatchObject({ open: true });
  });

  it("never trips on failures spread wider than a minute", async () => {
    const { breaker, tick } = setup();
    await failTimes(breaker, 4);
    tick(BREAKER.failureWindowMs + 1);
    await failTimes(breaker, 4);
    await expect(breaker.admit()).resolves.toEqual({ open: false });
  });

  it("probes after the window; each failed probe doubles the window, up to 10 minutes", async () => {
    const { breaker, tick } = setup();
    await failTimes(breaker, 5);
    const windows: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const gate = await breaker.admit();
      if (!gate.open) throw new Error("expected open");
      windows.push(gate.retryAfterSeconds);
      tick(gate.retryAfterSeconds * 1000);
      await expect(breaker.admit()).resolves.toEqual({ open: false });
      await breaker.record(fail());
    }
    expect(windows).toEqual([30, 60, 120, 240, 480, 600, 600]);
  });

  it("closes on a successful probe and forgets the trips", async () => {
    const { breaker, tick, onChange } = setup();
    await failTimes(breaker, 5);
    tick(30_000);
    await breaker.record(fail());
    tick(60_000);
    await breaker.record(noRecord);
    expect(onChange).toHaveBeenLastCalledWith({ state: "closed" });
    await failTimes(breaker, 5);
    await expect(breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 30 });
  });

  it("opens for the provider's retry-after on a quota refusal, or 60 s without one", async () => {
    const withHint = setup();
    await withHint.breaker.record(fail("quota", 120));
    await expect(withHint.breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 120 });
    const withoutHint = setup();
    await withoutHint.breaker.record(fail("quota"));
    await expect(withoutHint.breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 60 });
  });

  it("opens for 10 minutes when the key or plan is refused", async () => {
    const { breaker, onChange } = setup();
    await breaker.record(fail("refused"));
    await expect(breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 600 });
    expect(onChange).toHaveBeenCalledWith({ state: "open", openMs: 600_000, reason: "refused", scope: "provider" });
  });

  it("never counts answers or no record", async () => {
    const { breaker } = setup();
    for (const outcome of [noRecord, answered, noRecord, noRecord, noRecord, noRecord]) await breaker.record(outcome);
    await expect(breaker.admit()).resolves.toEqual({ open: false });
  });

  it("forgets trips after 30 quiet minutes", async () => {
    const { breaker, tick } = setup();
    await failTimes(breaker, 5);
    tick(BREAKER.tripMemoryMs + BREAKER.probeGraceMs + 1);
    await failTimes(breaker, 5);
    await expect(breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 30 });
  });

  it("reports why it opened, and who it rests", async () => {
    const { breaker, onChange } = setup();
    await failTimes(breaker, 5);
    expect(onChange).toHaveBeenCalledWith({ state: "open", openMs: 30_000, reason: "failures", scope: "endpoint" });
  });
});

describe("a wrong question", () => {
  it("never counts as a failure, however many times it is asked", async () => {
    const { breaker } = setup();
    for (let i = 0; i < 20; i += 1) await breaker.record(notOnRoute);
    await expect(breaker.admit()).resolves.toEqual({ open: false });
  });

  it("is not proof of recovery either: it never clears a trip the provider earned", async () => {
    const { breaker, tick } = setup();
    await failTimes(breaker, 5);
    tick(30_000);
    await breaker.record(notOnRoute);
    // The next real failure is still the second trip, so the window doubles rather than restarting.
    await breaker.record(fail());
    await expect(breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 60 });
  });

  it("stays invisible to the breaker while a provider that really refuses everything does not", async () => {
    const { breaker } = setup();
    // A 400 our adapter could not read is `unreadable`, not `INVALID`, and it counts.
    await failTimes(breaker, 5, "unreadable");
    await expect(breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 30 });
  });
});

describe("one provider, two fuses", () => {
  it("keeps a crawler's failures off the live PNR fuse", async () => {
    const { fuse } = railkit();
    const availability = fuse("availability");
    const pnr = fuse("pnr");
    await failTimes(availability.breaker, 10);
    await expect(availability.breaker.admit()).resolves.toMatchObject({ open: true });
    await expect(pnr.breaker.admit()).resolves.toEqual({ open: false });
  });

  it("keeps live PNR failures off the crawler's fuse", async () => {
    const { fuse } = railkit();
    const availability = fuse("availability");
    const pnr = fuse("pnr");
    await failTimes(pnr.breaker, 10);
    await expect(pnr.breaker.admit()).resolves.toMatchObject({ open: true });
    await expect(availability.breaker.admit()).resolves.toEqual({ open: false });
  });

  it("never lets a crawler's wrong questions wipe what the PNR fuse remembers", async () => {
    const { fuse, tick } = railkit();
    const availability = fuse("availability");
    const pnr = fuse("pnr");
    await failTimes(pnr.breaker, 5);
    tick(30_000);
    // A route list with trains the crawler has not verified: each answered correctly, and at once.
    for (let i = 0; i < 50; i += 1) await availability.breaker.record(notOnRoute);
    await pnr.breaker.record(fail());
    await expect(pnr.breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 60 });
  });

  it("never lets a crawler's wrong question clear the rest a refused key earned", async () => {
    const { fuse, tick } = railkit();
    const availability = fuse("availability");
    const pnr = fuse("pnr");
    await pnr.breaker.record(fail("refused"));
    tick(BREAKER.refusedOpenMs);
    // The one piece of state the two callers really do share, met by the crawler's commonest answer.
    await availability.breaker.record(notOnRoute);
    await pnr.breaker.record(fail());
    await expect(pnr.breaker.admit()).resolves.toMatchObject({ open: true });
  });

  it("rests both callers when the key or plan is refused, whichever of them found out", async () => {
    const { fuse } = railkit();
    const availability = fuse("availability");
    const pnr = fuse("pnr");
    await availability.breaker.record(fail("refused"));
    await expect(availability.breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 600 });
    await expect(pnr.breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 600 });
  });

  it("rests both callers when the plan's quota is spent", async () => {
    const { fuse } = railkit();
    const availability = fuse("availability");
    const pnr = fuse("pnr");
    await pnr.breaker.record(fail("quota", 120));
    await expect(pnr.breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 120 });
    await expect(availability.breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 120 });
  });

  it("lets a real answer on either side prove the key and the plan again", async () => {
    const { fuse, tick } = railkit();
    const availability = fuse("availability");
    const pnr = fuse("pnr");
    await pnr.breaker.record(fail("refused"));
    tick(BREAKER.refusedOpenMs);
    await availability.breaker.record(answered);
    expect(availability.onChange).toHaveBeenLastCalledWith({ state: "closed" });
    // The shared probe is gone, so the next PNR failure is a first failure and not a failed probe.
    await failTimes(pnr.breaker, 4);
    await expect(pnr.breaker.admit()).resolves.toEqual({ open: false });
  });

  it("gives each fuse its own escalation, so one caller's doubling is not the other's", async () => {
    const { fuse, tick } = railkit();
    const availability = fuse("availability");
    const pnr = fuse("pnr");
    for (let i = 0; i < 3; i += 1) {
      await failTimes(availability.breaker, 5);
      const gate = await availability.breaker.admit();
      if (!gate.open) throw new Error("expected open");
      tick(gate.retryAfterSeconds * 1000 + BREAKER.probeGraceMs + 1);
    }
    await failTimes(pnr.breaker, 5);
    await expect(pnr.breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 30 });
  });
});
