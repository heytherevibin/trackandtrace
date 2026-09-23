import { messages } from "@/messages";
import type { Breaker, Recordable } from "@/services/breaker";
import type { SourceFailure } from "./outcome";

// Wraps one third-party adapter, inside the fallback: while the provider's
// breaker is open nothing is asked of it (so the fallback answers at once);
// otherwise every request is counted, only safe failures are retried once, and
// the breaker hears the final answer.
//
// It is generic in the question and the answer so the same policy can wrap a
// `PnrDataSource` and an `AvailabilitySource` — both ask one thing and answer
// `{ ok: true, … }` or the shared failure shape, which is all this file reads.
// The two get different breakers, not different code: see `breaker.ts`.

/** One question, one answer — the shape both source seams already have. */
export interface Guardable<Q, O> {
  check(query: Q): Promise<O>;
}

export interface GuardDeps {
  readonly breaker: Breaker;
  /** Counts one provider request toward its daily usage. */
  readonly countRequest: () => Promise<void>;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly now?: () => number;
}

const RETRY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);
/** No retry once this much of the check has gone. */
const RETRY_BUDGET_MS = 3_000;

/** A network failure or a gateway error may pass; a timeout, a refusal or another error will not. */
export function isSafeToRetry(outcome: Recordable): boolean {
  if (outcome.ok) return false;
  return outcome.cause === "network" || (outcome.cause === "server" && outcome.status !== undefined && RETRY_STATUSES.has(outcome.status));
}

/** 200–500 ms of jitter, so retries from many checks don't arrive together. */
export function retryDelayMs(random: () => number): number {
  return 200 + Math.floor(random() * 301);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createGuardedSource<Q, O extends Recordable>(source: Guardable<Q, O>, deps: GuardDeps): Guardable<Q, O | SourceFailure> {
  const sleep = deps.sleep ?? wait;
  const random = deps.random ?? Math.random;
  const now = deps.now ?? Date.now;

  async function attempt(query: Q): Promise<O> {
    await deps.countRequest();
    return source.check(query);
  }

  return {
    async check(query) {
      const gate = await deps.breaker.admit();
      if (gate.open) return { ok: false, code: "SOURCE_UNAVAILABLE", message: messages.source.outcomes.resting, retryAfter: gate.retryAfterSeconds };

      const started = now();
      const first = await attempt(query);
      const retry = isSafeToRetry(first) && now() - started < RETRY_BUDGET_MS;
      if (retry) await sleep(retryDelayMs(random));
      const outcome = retry ? await attempt(query) : first;
      await deps.breaker.record(outcome);
      return outcome;
    },
  };
}
