import type { ConsoleRole } from "@/console/auth/member";
import { sendConsoleEmail } from "@/console/email/send";
import { consoleMessages } from "@/console/messages";
import { log } from "@/services/log";

/**
 * Where the invite link goes, given this request's console origin (built by `consoleOrigin`,
 * never `req.url` -- see src/console/hosts.ts). It lands on `/setup?token=…`, the same page the
 * first Owner's setup link already uses: src/app/console/setup/page.tsx reads a `token` query
 * param and, finding no link session, hands off to `RedeemToken` -- its own comment already
 * reserves this shape for an invite's entry ("Team's Invite states are drawn but unreachable
 * until the next PR"), and ConsoleSetup.dc.html draws "First Owner" and "Invite" as two entries
 * into one flow, not two pages.
 *
 * This task does not wire that redemption path -- `redeemSetupToken` still only understands a
 * first-Owner link, so an invite token opened today reads as an expired link rather than an
 * accepted one -- only the letter that carries it. Flagged in task-2-report.md.
 */
export function acceptInviteUrl(origin: string, token: string): string {
  return `${origin}/setup?token=${encodeURIComponent(token)}`;
}

/**
 * One invite letter, to a newly invited member. Modelled on `sendSignInLink`: it never throws, so
 * a caller can fire it from `after()` without the response path waiting on it or depending on it.
 * An invite already written to the database is a valid invite whether or not this send succeeds --
 * Task 7's resend exists for exactly that -- so a failure here is logged, never thrown; a throw
 * would let the invite look like it failed while it had actually succeeded, and a retry would then
 * hit "that address already has an open invite".
 *
 * `origin` must already be `consoleOrigin`'s output. An empty origin means the request's host did
 * not check out, so nothing is sent: a member-facing link is never assembled from input that
 * hasn't been checked.
 */
export async function sendInviteLetter(args: {
  readonly to: string;
  readonly token: string;
  readonly role: ConsoleRole;
  readonly invitedBy: string;
  readonly origin: string;
}): Promise<void> {
  try {
    const { to, token, role, invitedBy, origin } = args;
    if (!origin) {
      log.warn("[console] refused to send an invite letter: the request's host did not check out");
      return;
    }
    const link = acceptInviteUrl(origin, token);
    const roleLabel = consoleMessages.frame.roleLabel[role];
    const letter = consoleMessages.email.invite({ role: roleLabel, invitedBy, link });
    const outcome = await sendConsoleEmail({ to, ...letter });
    if (outcome === "failed") log.warn("[console] an invite letter could not be sent");
  } catch (err) {
    // Spec §5: an invite that was already written stays valid whether Resend is up or down -- the
    // failure is logged, never thrown into the request path that wrote it.
    log.warn("[console] sending an invite letter failed", err);
  }
}
