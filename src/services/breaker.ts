import type { Kv } from "./kv";
import type { SourceFailure } from "./sources/outcome";

// Circuit breakers per provider, their state in the shared store so every
// instance sees the same verdict. Repeated failures open one; while it is open
// nothing is asked of the provider; after the window, checks probe it again.
//
// **One provider, two fuses.** Live PNR checks and the availability crawler ask
// the same provider for different things, and their failures mean different
// things. A route crawler walking a list of trains it has not verified will
// collect refusals that say nothing about the provider's health, and before the
// split those refusals rested a traveller's PNR check — which, with
// `PNR_FALLBACK=none`, is that traveller's final answer.
//
// So each caller gets its own fuse for its own evidence, and both share one
// fuse for evidence about the provider itself: a refused key (401/403) and an
// exhausted plan (429) are facts about the account, not the endpoint, and they
// must rest everyone. `admit` consults both; `record` writes to exactly one.

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

/**
 * Which callers a window rests. `provider` is everyone who holds this key;
 * `endpoint` is the one caller whose own requests were failing.
 */
export type BreakerScopeName = "provider" | "endpoint";

/**
 * The two key prefixes one caller writes under.
 *
 * `provider` is shared by every caller of that provider; `endpoint` is this
 * caller's alone. They must not be prefixes of one another's key names — in
 * practice `endpoint` extends `provider` with a caller segment, so
 * `…:railkit:open` and `…:railkit:pnr:open` never collide.
 */
export interface BreakerScope {
  readonly provider: string;
  readonly endpoint: string;
}

export type Admission = { readonly open: false } | { readonly open: true; readonly retryAfterSeconds: number };

export type BreakerEvent =
  | {
      readonly state: "open";
      readonly openMs: number;
      readonly reason: "failures" | "quota" | "refused";
      readonly scope: BreakerScopeName;
    }
  | { readonly state: "closed" };

/**
 * All a breaker is told: that the provider answered, or how it failed.
 *
 * Deliberately narrower than any one source's outcome — a breaker has no
 * business reading a PNR result or a berth count, and this is what lets the
 * same guard wrap a `PnrDataSource` and an `AvailabilitySource`.
 */
export type Recordable = { readonly ok: true } | SourceFailure;

export interface Breaker {
  /** Whether the provider may be asked now; when not, how long until it may. */
  admit(): Promise<Admission>;
  /** What the provider answered. */
  record(outcome: Recordable): Promise<void>;
}

interface Keys {
  readonly open: string;
  readonly fails: string;
  readonly trips: string;
  readonly probe: string;
}

function keysFor(base: string): Keys {
  return { open: `${base}:open`, fails: `${base}:fails`, trips: `${base}:trips`, probe: `${base}:probe` };
}

export function createBreaker(kv: Kv, scope: BreakerScope, options: { readonly onChange?: (event: BreakerEvent) => void } = {}): Breaker {
  const provider = keysFor(scope.provider);
  const endpoint = keysFor(scope.endpoint);
  const emit = options.onChange ?? (() => {});

  async function openFor(key: Keys, name: BreakerScopeName, ms: number, reason: "failures" | "quota" | "refused"): Promise<void> {
    await kv.set(key.open, String(ms), ms);
    await kv.set(key.probe, "1", ms + BREAKER.probeGraceMs);
    await kv.del(key.fails);
    emit({ state: "open", openMs: ms, reason, scope: name });
  }

  async function trip(): Promise<void> {
    const trips = await kv.incr(endpoint.trips, BREAKER.tripMemoryMs, true);
    await openFor(endpoint, "endpoint", Math.min(BREAKER.baseOpenMs * 2 ** (trips - 1), BREAKER.maxOpenMs), "failures");
  }

  /**
   * Both windows, because either one resting this caller is a reason not to ask,
   * and the longer of the two is how long it rests — neither is reliably the
   * larger, since an endpoint that keeps failing escalates to ten minutes while a
   * 429 carrying `Retry-After: 5` rests everyone for five seconds.
   *
   * Two reads where one used to do, so they go concurrently: this is the hot path
   * of every live PNR check, and the store is one HTTP request per command.
   */
  async function restingMs(): Promise<number> {
    const [shared, own] = await Promise.all([kv.ttl(provider.open), kv.ttl(endpoint.open)]);
    return Math.max(shared, own);
  }

  /**
   * A real answer clears both memories this caller can see. It proves the
   * endpoint works *and* that the key was accepted and the plan had quota, so
   * the provider-wide escalation has no more reason to stand than this one's.
   * It cannot reach another caller's endpoint keys, which is the whole point.
   */
  async function recovered(): Promise<void> {
    let closed = false;
    for (const key of [provider, endpoint]) {
      if (!(await kv.get(key.probe))) continue;
      await kv.del(key.probe);
      await kv.del(key.trips);
      closed = true;
    }
    if (closed) emit({ state: "closed" });
  }

  /** Inside a window or its grace, one more failure means it has not recovered. Either window counts: both are this caller's own recent trouble. */
  async function probing(): Promise<boolean> {
    return Boolean((await kv.get(endpoint.probe)) ?? (await kv.get(provider.probe)));
  }

  return {
    async admit() {
      const ms = await restingMs();
      return ms > 0 ? { open: true, retryAfterSeconds: Math.ceil(ms / 1000) } : { open: false };
    },

    async record(outcome) {
      // Checks admitted before the breaker opened answer late; they say nothing new.
      if ((await restingMs()) > 0) return;

      if (outcome.ok) return recovered();
      // A wrong question. The provider read it, refused it correctly and quickly, and told us
      // why: that is neither a sick provider nor proof of a well one, so the breaker learns
      // nothing from it. A crawler walking an unverified route list produces thousands, and a
      // provider that really starts refusing everything still reaches the counter below,
      // because an unrecognised refusal is classified `unreadable` and not `INVALID`.
      if (outcome.code === "INVALID") return;
      if (outcome.code !== "SOURCE_UNAVAILABLE") return recovered();

      // A refused key and a spent plan are facts about the provider, not this endpoint: they rest every caller.
      if (outcome.cause === "refused") return openFor(provider, "provider", BREAKER.refusedOpenMs, "refused");
      if (outcome.cause === "quota") return openFor(provider, "provider", (outcome.retryAfter ?? BREAKER.quotaOpenMs / 1000) * 1000, "quota");

      if (await probing()) return trip();
      const failures = await kv.incr(endpoint.fails, BREAKER.failureWindowMs);
      if (failures >= BREAKER.threshold) await trip();
    },
  };
}
