import type { PnrOutcome } from "@/types/domain";

/** Why a provider could not answer. Server-only: it drives the breaker and the retry policy, and never reaches the wire. */
export type FailureCause = "timeout" | "network" | "server" | "refused" | "quota" | "unreadable";

export type SourceFailure = Extract<PnrOutcome, { ok: false }> & { readonly cause?: FailureCause; readonly status?: number };
export type SourceOutcome = Extract<PnrOutcome, { ok: true }> | SourceFailure;

export function unavailable(message: string, cause: FailureCause, extra: { readonly status?: number; readonly retryAfter?: number } = {}): SourceFailure {
  return {
    ok: false,
    code: "SOURCE_UNAVAILABLE",
    message,
    cause,
    ...(extra.status === undefined ? {} : { status: extra.status }),
    ...(extra.retryAfter === undefined ? {} : { retryAfter: extra.retryAfter }),
  };
}

/** A parser that answers "unavailable" read something it could not trust: an unreadable record. */
export function markUnreadable(outcome: PnrOutcome): SourceOutcome {
  return !outcome.ok && outcome.code === "SOURCE_UNAVAILABLE" ? { ...outcome, cause: "unreadable" } : outcome;
}
