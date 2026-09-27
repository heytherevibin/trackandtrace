import { describe, expect, it, vi } from "vitest";
import { readBreakerState } from "@/services/breaker";
import type { Kv } from "@/services/kv";

// ---------------------------------------------------------------------------
// The breaker, read rather than asked.
//
// `admit()` is the gate's own question and it is not a dashboard's to ask: a page
// drawing a state must not be a caller taking part in the decision. This is the
// read that was never written — the same absence `liveSpendToday` filled for the
// budget meter.
//
// **Which fuse is open says why it opened.** The provider-wide fuse opens only on
// a refused key or a spent plan; a caller's own fuse opens only on failures. The
// reason itself is never stored — `openFor` emits it and writes only a duration —
// so the scope is the most this can honestly say, and it says that rather than
// inventing the sentence the sheet draws.
// ---------------------------------------------------------------------------

function store(values: Readonly<Record<string, string>>, ttls: Readonly<Record<string, number>> = {}): Kv {
  return {
    get: vi.fn(async (key: string) => values[key] ?? null),
    ttl: vi.fn(async (key: string) => ttls[key] ?? -1),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    incrBy: vi.fn(),
  } as unknown as Kv;
}

const SCOPE = { provider: "tt:production:breaker:railkit", endpoint: "tt:production:breaker:railkit:availability" };

describe("readBreakerState", () => {
  it("says it is answering when neither fuse is open", async () => {
    const state = await readBreakerState(store({}), SCOPE);

    expect(state.open).toBe(false);
    expect(state.retryAfterSeconds).toBeNull();
    expect(state.openedBy).toBeNull();
  });

  it("reports a caller's own fuse, and that failures are what open one", async () => {
    const state = await readBreakerState(store({ [`${SCOPE.endpoint}:open`]: "30000" }, { [`${SCOPE.endpoint}:open`]: 22 }), SCOPE);

    expect(state.open).toBe(true);
    expect(state.retryAfterSeconds).toBe(22);
    expect(state.openedBy).toBe("endpoint");
  });

  it("reports the provider-wide fuse, which opens for a different reason entirely", async () => {
    // Only a refused key or a spent plan opens this one, and neither is a run of
    // bad luck: the operator's next move is different, so the two are not merged.
    const state = await readBreakerState(store({ [`${SCOPE.provider}:open`]: "600000" }, { [`${SCOPE.provider}:open`]: 540 }), SCOPE);

    expect(state.open).toBe(true);
    expect(state.openedBy).toBe("provider");
  });

  it("names the provider fuse when both are open, because it is the one that outlasts the other", async () => {
    const state = await readBreakerState(
      store(
        { [`${SCOPE.provider}:open`]: "600000", [`${SCOPE.endpoint}:open`]: "30000" },
        { [`${SCOPE.provider}:open`]: 540, [`${SCOPE.endpoint}:open`]: 22 },
      ),
      SCOPE,
    );

    expect(state.openedBy).toBe("provider");
    expect(state.retryAfterSeconds).toBe(540);
  });

  it("carries the window's own figures and the trips earned today", async () => {
    const state = await readBreakerState(
      store({ [`${SCOPE.endpoint}:fails`]: "5", [`${SCOPE.endpoint}:asks`]: "10", [`${SCOPE.endpoint}:trips`]: "2" }),
      SCOPE,
    );

    expect(state.failures).toBe(5);
    expect(state.asks).toBe(10);
    expect(state.trips).toBe(2);
  });

  it("reads absent counters as none, because a fuse nobody has tested has no failures", async () => {
    const state = await readBreakerState(store({}), SCOPE);

    expect(state).toMatchObject({ failures: 0, asks: 0, trips: 0 });
  });

  it("answers rather than throwing when the store cannot be read at all", async () => {
    // A dashboard that 500s because its status widget could not load is worse than
    // one that says it does not know.
    const broken = {
      get: vi.fn(async () => {
        throw new Error("unreachable");
      }),
      ttl: vi.fn(async () => {
        throw new Error("unreachable");
      }),
    } as unknown as Kv;

    await expect(readBreakerState(broken, SCOPE)).resolves.toMatchObject({ known: false });
  });
});
