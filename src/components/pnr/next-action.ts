import { messages } from "@/messages";
import type { PnrResult } from "@/types/domain";
import { countdownTo, formatTime } from "@/utils/datetime";

// v4's Next box (handoff "Next box is new: NextAction"; trakline-core.js lookup().next): one instruction per state, the
// chart's time as the source gave it, and a countdown to it. Nothing here predicts: a ticket reads Dropped only when the
// source says the chart is prepared and a passenger is still waiting, never from the clock alone.

const WORDS = ["", "one", "two", "three", "four", "five", "six"] as const;
const word = (n: number): string => WORDS[n] ?? String(n);

export interface NextAction {
  /** The box's legend: Next, Chart in, Chart prepared, or Chart prepared · not confirmed. */
  readonly head: string;
  /** The big figure beside the instruction: the countdown, Final or Dropped; null when there is none to show. */
  readonly big: string | null;
  readonly text: string;
  /** Drawn on paper, not yellow: a cancelled or dropped ticket has nothing left to act on. */
  readonly quiet: boolean;
  /** Replaces the status's own description when the chart has decided against the ticket. */
  readonly long: string | null;
}

export type FailureKind = "notfound" | "unavailable" | "limited" | "refused" | "offline";

export function nextForResult(result: PnrResult, now: Date): NextAction {
  const m = messages.check.next;
  const { snapshot, lead } = result;
  const pax = snapshot.pax;
  const pending = pax.filter((p) => p.currentStatus === "RAC" || p.currentStatus === "WL").length;
  const prepared = snapshot.chartPrepared === true;

  if (lead.status === "CANCELLED") return { head: m.head.next, big: null, text: m.cancelled, quiet: true, long: null };
  if (prepared && pending > 0) {
    const long = pax.length > 1 ? m.droppedPartyLong(word(pending), word(pax.length)) : m.droppedLong;
    return { head: m.head.dropped, big: m.big.dropped, text: m.dropped, quiet: true, long };
  }
  if (prepared) return { head: m.head.prepared, big: m.big.final, text: m.final, quiet: false, long: null };
  if (!snapshot.chartAt) return { head: m.head.next, big: null, text: pending === 0 ? m.confirmed : m.noChart, quiet: false, long: null };

  const left = countdownTo(snapshot.chartAt, now);
  const big = left.state === "ahead" ? m.countdown(left.hours, left.minutes) : null;
  const head = big ? m.head.chartIn : m.head.next;
  if (pending === 0) return { head, big, text: m.confirmed, quiet: false, long: null };
  const time = snapshot.chartTime ?? formatTime(snapshot.chartAt);
  const who = pending === pax.length ? m.thisTicket : m.stillWaiting(word(pending));
  return { head, big, text: m.waiting(time, who), quiet: false, long: null };
}

export function nextForFailure(kind: FailureKind, retryAfter?: number): string {
  const f = messages.check.next.failure;
  if (kind === "limited") return typeof retryAfter === "number" ? f.limited(retryAfter) : f.limitedLater;
  return f[kind];
}
