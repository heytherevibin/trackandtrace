import { messages } from "@/messages";
import type { Breaker } from "@/services/breaker";
import type { PnrDataSource } from "@/services/pnr-source";
import type { SourceOutcome } from "./outcome";

// Wraps one third-party adapter, inside the fallback: while the provider's
// breaker is open nothing is asked of it (so the fallback answers at once);
// otherwise every request is counted, only safe failures are retried once, and
// the breaker hears the final answer.

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
export function isSafeToRetry(outcome: SourceOutcome): boolean {
  if (outcome.ok) return false;
  return outcome.cause === "network" || (outcome.cause === "server" && outcome.status !== undefined && RETRY_STATUSES.has(outcome.status));
}

/** 200–500 ms of jitter, so retries from many checks don't arrive together. */
export function retryDelayMs(random: () => number): number {
  return 200 + Math.floor(random() * 301);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createGuardedSource(source: PnrDataSource, deps: GuardDeps): PnrDataSource {
  const sleep = deps.sleep ?? wait;
  const random = deps.random ?? Math.random;
  const now = deps.now ?? Date.now;

  async function attempt(pnr: string): Promise<SourceOutcome> {
    await deps.countRequest();
    return source.check(pnr);
  }

  return {
    async check(pnr) {
      const gate = await deps.breaker.admit();
      if (gate.open) return { ok: false, code: "SOURCE_UNAVAILABLE", message: messages.source.outcomes.resting, retryAfter: gate.retryAfterSeconds };

      const started = now();
      const first = await attempt(pnr);
      const retry = isSafeToRetry(first) && now() - started < RETRY_BUDGET_MS;
      if (retry) await sleep(retryDelayMs(random));
      const outcome = retry ? await attempt(pnr) : first;
      await deps.breaker.record(outcome);
      return outcome;
    },
  };
}
