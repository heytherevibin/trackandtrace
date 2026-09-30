import type { Kv } from "@/services/kv";

// One count per Resend day of every email this deployment sends. Resend's Free plan allows 100 a day
// and resets at 00:00 UTC (05:30 IST) — checked on the account 2026-09-28 — so the day here is UTC's,
// not India's. The two calendars disagree for five and a half hours every night, and a counter keyed
// to India's would reset while Resend's was still spent.
//
// Sign-up confirmations may take from it only while the count is below 60; the other 40 are kept so
// console sign-in links and security alerts are never the ones Resend refuses. Console mail is
// counted, never gated: an operator locked out because travellers signed up is the wrong failure.

export const CONFIRMATION_CEILING = 60;

/** Two days, so a key written just before midnight UTC is still readable through the day it belongs to. */
const KEPT_MS = 2 * 24 * 60 * 60 * 1000;

export function emailDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function key(prefix: string, at: Date): string {
  return `${prefix}:email:${emailDay(at)}`;
}

/**
 * One confirmation's worth, or why not.
 *
 * Fails CLOSED: a count nobody can read gives nothing. The alternative — sending while blind —
 * spends the console's reserve on travellers, and the first thing anyone notices is an operator
 * unable to sign in.
 */
export async function takeConfirmation(kv: Kv, prefix: string, at: Date): Promise<"ok" | "spent" | "unknown"> {
  try {
    const n = await kv.incr(key(prefix, at), KEPT_MS);
    if (n <= CONFIRMATION_CEILING) return "ok";
    // Give the count back. Incremented first and returned after, because the other order lets two
    // requests read the same number and both be told yes. A refusal must not push the ceiling up.
    await kv.incrBy(key(prefix, at), KEPT_MS, -1).catch(() => undefined);
    return "spent";
  } catch {
    return "unknown";
  }
}

/** Counts a send that did not go through `takeConfirmation`. Best-effort: never why a send fails. */
export async function countSent(kv: Kv, prefix: string, at: Date): Promise<void> {
  try {
    await kv.incr(key(prefix, at), KEPT_MS);
  } catch {
    // Counting is best-effort. A console sign-in link that reached its reader but could not be
    // counted is a better outcome than one that was not sent because the counter was down.
  }
}
