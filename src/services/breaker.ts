import type { Kv } from "./kv";
import type { SourceOutcome } from "./sources/outcome";

// One circuit breaker per provider, its state in the shared store so every
// instance sees the same verdict. Repeated failures open it; while it is open
// nothing is asked of the provider; after the window, checks probe it again.

export const BREAKER = {
  /** Counting failures within `failureWindowMs` that open the breaker. */
  threshold: 5,
  failureWindowMs: 60_000,
  /** The first window; each repeat trip doubles it, up to `maxOpenMs`. */
  baseOpenMs: 30_000,
  maxOpenMs: 600_000,
  /** How long a trip is remembered for doubling. */
  tripMemoryMs: 1_800_000,
  /** A refused key or plan (401/403). */
  refusedOpenMs: 600_000,
  /** A quota refusal (429) without a Retry-After. */
  quotaOpenMs: 60_000,
  /** How long after a window a failed probe still re-opens at once. */
  probeGraceMs: 300_000,
} as const;

export type Admission = { readonly open: false } | { readonly open: true; readonly retryAfterSeconds: number };

export type BreakerEvent =
  | { readonly state: "open"; readonly openMs: number; readonly reason: "failures" | "quota" | "refused" }
  | { readonly state: "closed" };

export interface Breaker {
  /** Whether the provider may be asked now; when not, how long until it may. */
  admit(): Promise<Admission>;
  /** What the provider answered. */
  record(outcome: SourceOutcome): Promise<void>;
}

export function createBreaker(kv: Kv, base: string, options: { readonly onChange?: (event: BreakerEvent) => void } = {}): Breaker {
  const key = { open: `${base}:open`, fails: `${base}:fails`, trips: `${base}:trips`, probe: `${base}:probe` } as const;
  const emit = options.onChange ?? (() => {});

  async function openFor(ms: number, reason: "failures" | "quota" | "refused"): Promise<void> {
    await kv.set(key.open, String(ms), ms);
    await kv.set(key.probe, "1", ms + BREAKER.probeGraceMs);
    await kv.del(key.fails);
    emit({ state: "open", openMs: ms, reason });
  }

  async function trip(): Promise<void> {
    const trips = await kv.incr(key.trips, BREAKER.tripMemoryMs, true);
    await openFor(Math.min(BREAKER.baseOpenMs * 2 ** (trips - 1), BREAKER.maxOpenMs), "failures");
  }

  return {
    async admit() {
      const ms = await kv.ttl(key.open);
      return ms > 0 ? { open: true, retryAfterSeconds: Math.ceil(ms / 1000) } : { open: false };
    },

    async record(outcome) {
      // Checks admitted before the breaker opened answer late; they say nothing new.
      if ((await kv.ttl(key.open)) > 0) return;

      if (outcome.ok || outcome.code !== "SOURCE_UNAVAILABLE") {
        if (await kv.get(key.probe)) {
          await kv.del(key.probe);
          await kv.del(key.trips);
          emit({ state: "closed" });
        }
        return;
      }
      if (outcome.cause === "refused") return openFor(BREAKER.refusedOpenMs, "refused");
      if (outcome.cause === "quota") return openFor((outcome.retryAfter ?? BREAKER.quotaOpenMs / 1000) * 1000, "quota");
      if (await kv.get(key.probe)) return trip();
      const failures = await kv.incr(key.fails, BREAKER.failureWindowMs);
      if (failures >= BREAKER.threshold) await trip();
    },
  };
}
