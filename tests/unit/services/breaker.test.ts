import { describe, expect, it, vi } from "vitest";
import { BREAKER, createBreaker } from "@/services/breaker";
import { MemoryKv } from "@/services/kv";
import type { FailureCause, SourceOutcome } from "@/services/sources/outcome";

function setup() {
  const clock = { now: 1_000_000 };
  const onChange = vi.fn();
  const breaker = createBreaker(new MemoryKv(() => clock.now), "tt:test:breaker:railkit", { onChange });
  return { breaker, onChange, tick: (ms: number) => { clock.now += ms; } };
}

const fail = (cause: FailureCause = "server", retryAfter?: number): SourceOutcome => ({
  ok: false,
  code: "SOURCE_UNAVAILABLE",
  message: "x",
  cause,
  ...(retryAfter === undefined ? {} : { retryAfter }),
});
const noRecord: SourceOutcome = { ok: false, code: "NOT_FOUND", message: "none" };

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
    expect(onChange).toHaveBeenCalledWith({ state: "open", openMs: 600_000, reason: "refused" });
  });

  it("never counts answers, no record, or invalid input", async () => {
    const { breaker } = setup();
    const answers: SourceOutcome[] = [noRecord, { ok: false, code: "INVALID", message: "bad" }, noRecord, noRecord, noRecord, noRecord];
    for (const outcome of answers) await breaker.record(outcome);
    await expect(breaker.admit()).resolves.toEqual({ open: false });
  });

  it("forgets trips after 30 quiet minutes", async () => {
    const { breaker, tick } = setup();
    await failTimes(breaker, 5);
    tick(BREAKER.tripMemoryMs + BREAKER.probeGraceMs + 1);
    await failTimes(breaker, 5);
    await expect(breaker.admit()).resolves.toEqual({ open: true, retryAfterSeconds: 30 });
  });

  it("reports why it opened", async () => {
    const { breaker, onChange } = setup();
    await failTimes(breaker, 5);
    expect(onChange).toHaveBeenCalledWith({ state: "open", openMs: 30_000, reason: "failures" });
  });
});
