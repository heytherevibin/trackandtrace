"use client";

import { z } from "zod";
import { consoleApiMessage } from "@/console/api-message";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { apiRequest } from "@/services/api-client";

// The browser-side call the Team page's one client component needs: sending an invite. Modelled on
// `removeKey` in src/console/account/my-keys-client.ts.
//
// There is deliberately no `fetchTeam()` beside it (task-4-addendum.md §5). The three plates stay
// server components and an invite refreshes them with `router.refresh()`, so the page re-runs
// `getTeam()` server-side and the refreshed list cannot disagree with the first paint. Tasks 5-7
// convert the plates to client components for their own row actions, and that is where a re-fetch
// belongs.

// `.strict()` is the point, not decoration: POST /api/team answers `{ ok: true }` and nothing more,
// because the raw invite token is a console-access credential and must never reach a browser
// (task-4-addendum.md §3). A route that started echoing one would fail to parse here rather than
// quietly hand it to a caller that might log it.
const invitedSchema = z.object({ ok: z.literal(true) }).strict();

/**
 * The refusals that are about the address itself and so cannot succeed until it changes -- as
 * opposed to a stale tap or a console that could not be reached, both of which the very same
 * address can retry, and both of whose copy says so in as many words.
 *
 * This compares the message the server sent against the very objects the server's own mapper built
 * its AppError from: `fromInviteError` (src/console/team/team.ts) reads
 * `consoleMessages.team.invite.alreadyMember` and this file reads the same property of the same
 * object. That is not the pattern ConfirmItsYou's own note rejects -- that one matched a server
 * message against a *second, locally restated* wording, which could drift the moment either was
 * edited. There is one copy here, and editing it moves both halves at once.
 *
 * A message this set has never seen falls through as `false`, deliberately: an unclassified refusal
 * should leave a member able to try again, not lock a field over a sentence nobody wrote a rule for.
 */
const ADDRESS_BOUND: ReadonlySet<string> = new Set([
  consoleMessages.team.invite.alreadyMember,
  consoleMessages.team.invite.alreadyInvited,
  consoleMessages.team.invite.travellerAccount,
]);

export type InviteOutcome =
  | { readonly kind: "done" }
  | {
      readonly kind: "failed";
      readonly message: string;
      /**
       * Whether retrying with this same address could ever succeed. The dialog latches its Email
       * field -- `aria-invalid`, the alert beneath it, Continue disabled -- only when this is true,
       * so that the two refusals whose copy invites a retry do not disable the one control that
       * retries.
       */
      readonly boundToAddress: boolean;
    };

/**
 * Sends one invite (task-4, Form TC-04). Called only after ConfirmItsYou's `onConfirmed` fires --
 * a completed tap -- never before.
 *
 * `email` arrives already lower-cased, the same string the tap was minted over: `console_invite_member`
 * digests `lower(p_email)`, so a capital here would spend against a digest the tap was never taken
 * for and the invite would fail with "no tap for this action" with nothing to say why. `reason` goes
 * out exactly as the member typed it -- only the route's own `tapReason` import trims and digests
 * it, so a second trim here would risk the two disagreeing.
 *
 * Every refusal comes back as a message already written for a member to read: the route translates
 * `console_invite_member`'s four developer strings, and `consoleApiMessage` answers the two codes
 * that carry a failing layer's own wording with the console's own sentence instead.
 */
export async function inviteMember(email: string, role: ConsoleRole, reason: string): Promise<InviteOutcome> {
  const result = await apiRequest(
    "/api/team",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role, reason }) },
    invitedSchema,
  );
  if (result.ok) return { kind: "done" };
  const message = consoleApiMessage(result.error);
  return { kind: "failed", message, boundToAddress: ADDRESS_BOUND.has(message) };
}
