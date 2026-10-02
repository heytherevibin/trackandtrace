import { emailDay } from "@/services/email/allowance";
import type { Kv } from "@/services/kv";

// Resend's Free plan allows 100 emails a day for the whole deployment, so an announcement to a list
// cannot fit in one day and drains across several, taking whatever the day's allowance leaves.
//
// Three ceilings share ONE counter, and they compose without a fourth rule:
//   announcements may take only while the day's total is under 40;
//   confirmations may take only while it is under 60 (allowance.ts);
//   operator mail — console sign-in links, security alerts — is counted but never gated.
// Worst case the day fills 0-40 announcements, 40-60 confirmations, 60-100 operators, and the
// operators' reserve holds. If confirmations arrive first and reach 40, announcements send nothing
// that day. That is the intended order of sacrifice, not a bug: an announcement can always wait a
// day, a confirmation link expires in 48 hours, and an operator locked out is the wrong failure.

export const ANNOUNCEMENT_CEILING = 40;

/** Two days, as in allowance.ts, so a key written just before midnight UTC outlives the day it belongs to. */
const KEPT_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * The same counter confirmations use, on Resend's UTC day. Load-bearing: a separate key would turn
 * one ceiling of 100 into two ceilings of 100 and the whole budget argument collapses.
 */
function key(prefix: string, at: Date): string {
  return `${prefix}:email:${emailDay(at)}`;
}

/** How many announcement emails fit once `countToday` have gone out. Never negative. */
export function announcementBudget(countToday: number): number {
  return Math.max(0, ANNOUNCEMENT_CEILING - countToday);
}

/**
 * Reserves up to `want` announcement emails against today's counter and returns how many it got.
 *
 * Reserves optimistically with one `incrBy(+want)` and gives the unused part back, the order
 * `takeConfirmation` uses: reading the count first and adding after lets two drains read the same
 * number and both be told yes. Fails CLOSED — a counter nobody can read gives 0, because sending
 * blind spends the operators' reserve and the first anyone notices is an operator unable to sign in.
 */
export async function takeAnnouncements(kv: Kv, prefix: string, at: Date, want: number): Promise<number> {
  if (!Number.isSafeInteger(want) || want <= 0) return 0;
  try {
    const after = await kv.incrBy(key(prefix, at), KEPT_MS, want);
    const fit = Math.min(want, announcementBudget(after - want));
    const unused = want - fit;
    if (unused > 0) {
      // Give back what did not fit. A refusal must not eat the allowance that confirmations and
      // operators are still counting on. If the refund itself fails the day is over-counted, which
      // errs toward sending less, and the `fit` that was reserved is still ours to send.
      await kv.incrBy(key(prefix, at), KEPT_MS, -unused).catch(() => undefined);
    }
    return fit;
  } catch {
    return 0;
  }
}
