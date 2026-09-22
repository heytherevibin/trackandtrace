"use client";

import { z } from "zod";
import { consoleApiMessage } from "@/console/api-message";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { apiRequest } from "@/services/api-client";

// The browser-side calls the Team page's client components need: sending an invite (task-4),
// changing a role (task-5), and resetting a member's keys or removing them (task-6). Modelled on
// `removeKey` in src/console/account/my-keys-client.ts.
//
// There is still deliberately no `fetchTeam()` beside them (task-4-addendum.md §5). The three
// plates stayed server components through Task 6: every row action refreshes them with
// `router.refresh()`, so the page re-runs `getTeam()` server-side and the refreshed list cannot
// disagree with the first paint. Task 4's note expected Tasks 5-7 to convert the plates and add a
// re-fetch; neither task needed to, because a dialog opened from one row has nothing to patch that
// a server re-render does not do better.

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

// PATCH /api/team/member answers `{ ok: true }` and nothing more: there is nothing to report back
// about a role change that the refreshed roster will not show, and `.strict()` is what keeps a
// later route from quietly growing a field nobody here has read.
const changedSchema = z.object({ ok: z.literal(true) }).strict();

/**
 * There is no `boundToAddress` counterpart here, deliberately. That flag exists because the invite
 * dialog has a field a member can edit, and three of its refusals can only ever be fixed by editing
 * it. This dialog has a radiogroup and a reason, and no refusal it can receive is about either --
 * a stale tap and a roster that moved both want the same change tried again, unchanged. One shape
 * for every refusal is the honest one.
 */
export type RoleChangeOutcome = { readonly kind: "done" } | { readonly kind: "failed"; readonly message: string };

/**
 * Changes one member's role (task-5, ConsoleTeam.dc.html's dlg_role). Called only after
 * ConfirmItsYou's `onConfirmed` fires -- a completed tap -- never before.
 *
 * `member` is the id `console_team` returned, passed through untouched: the tap was minted over
 * this exact string and `console.use_tap` re-digests `p_member::text`, Postgres's own lowercase
 * canonical uuid. `role` and `reason` go out as the dialog holds them, the same two the tap was
 * minted with -- only the route's own `tapReason` import trims and digests the reason, so a second
 * trim here would risk the two disagreeing.
 *
 * Every refusal comes back as a message already written for a member to read: the route's mapper
 * translates `console_change_role`'s developer strings, and `consoleApiMessage` answers the two
 * codes that carry a failing layer's own wording with the console's own sentence instead.
 */
export async function changeRole(member: string, role: ConsoleRole, reason: string): Promise<RoleChangeOutcome> {
  const result = await apiRequest(
    "/api/team/member",
    { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ member, role, reason }) },
    changedSchema,
  );
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}

// DELETE /api/team/keys answers `{ ok: true, count }`: the one call on this page whose success
// carries something back, because console_reset_keys returns how many keys it deleted and the
// caller builds a sentence out of it. `.strict()` again -- and the count is required, not optional:
// a success with no count is not one this caller can report, and guessing at it (from the row, say)
// would have the console tell a member what it assumed rather than what happened.
const resetSchema = z.object({ ok: z.literal(true), count: z.number().int().nonnegative() }).strict();

/**
 * Two shapes, not one, and `count` is the reason: `done` carries what to say, `failed` carries what
 * went wrong. There is no `boundToAddress` counterpart here for the same reason changeRole has none
 * -- this dialog has a reason field and nothing else, and no refusal it can receive is about that.
 */
export type ResetKeysOutcome = { readonly kind: "done"; readonly count: number } | { readonly kind: "failed"; readonly message: string };

/**
 * Resets one member's keys (task-6, ConsoleTeam.dc.html's dlg_reset). Called only after
 * ConfirmItsYou's `onConfirmed` fires -- a completed tap -- never before.
 *
 * The key count the tap was minted over is deliberately not sent. `console_reset_keys` counts the
 * member's keys itself, inside the transaction that deletes them, and `console.use_tap` re-digests
 * that count -- so the browser's own number is the thing being *checked*, not a thing to pass along
 * (task-6-addendum.md §3). Sending it would invite a caller to send the number that matches rather
 * than the number the page showed, which is the whole point of the digest.
 *
 * `member` is the id `console_team` returned, passed through untouched, and `reason` goes out
 * exactly as the member typed it -- only the route's own `tapReason` import trims and digests it.
 *
 * Every refusal comes back as a message already written for a member to read: the route's mapper
 * translates `console_reset_keys`' developer strings, and `consoleApiMessage` answers the two codes
 * that carry a failing layer's own wording with the console's own sentence instead.
 */
export async function resetKeys(member: string, reason: string): Promise<ResetKeysOutcome> {
  const result = await apiRequest(
    "/api/team/keys",
    { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ member, reason }) },
    resetSchema,
  );
  return result.ok ? { kind: "done", count: result.data.count } : { kind: "failed", message: consoleApiMessage(result.error) };
}

// DELETE /api/team/member answers `{ ok: true }` and nothing more: a removed member falls out of
// console_team's roster entirely, so there is nothing to report back that the refreshed list will
// not show by their absence.
const removedSchema = z.object({ ok: z.literal(true) }).strict();

export type RemoveMemberOutcome = { readonly kind: "done" } | { readonly kind: "failed"; readonly message: string };

/**
 * Removes one member (task-6, ConsoleTeam.dc.html's dlg_remove). Called only after ConfirmItsYou's
 * `onConfirmed` fires -- a completed tap -- never before.
 *
 * No role is sent, although the tap is minted over one: `console_remove_member` digests
 * `v_target.role::text`, the role it reads for the target under a lock, so the browser's own copy
 * is what is being checked rather than what is being passed. The same reasoning as the key count
 * above, and the route's `.strict()` body enforces it.
 */
export async function removeMember(member: string, reason: string): Promise<RemoveMemberOutcome> {
  const result = await apiRequest(
    "/api/team/member",
    { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ member, reason }) },
    removedSchema,
  );
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}

// POST /api/team/invite answers `{ ok: true }` and nothing more, and `.strict()` is load-bearing
// here for exactly the reason it is on `invitedSchema` at the top of this file: a resend mints a
// FRESH raw invite token, which is the same console-access credential the first one was. The route
// consumes it server-side for the letter; a route that started echoing one would fail to parse here
// rather than quietly hand it to a caller that might log it (task-7-addendum.md §4).
const resentSchema = z.object({ ok: z.literal(true) }).strict();

/**
 * No `boundToAddress` counterpart, for the reason changeRole's own note gives: there is no field to
 * latch. The resend dialog is a plain confirmation over a row the Owner picked, and its one refusal
 * -- the invite moved -- wants the page re-read, not a value edited.
 */
export type ResendInviteOutcome = { readonly kind: "done" } | { readonly kind: "failed"; readonly message: string };

/**
 * Resends one pending invite (task-7, ConsoleTeam.dc.html's dlg_resend). The one call on this page
 * that follows no tap: resending re-sends a letter to an address an Owner already approved and
 * changes no access, so `console_resend_invite` takes neither a reason nor a ceremony.
 *
 * `invite` is the id `console_team` returned, passed through untouched. Nothing digests it here --
 * there is no tap to match -- but the route checks it as a uuid, and reshaping an id on its way to a
 * lookup is how a row that exists is reported as one that does not.
 *
 * Every refusal comes back as a message already written for a member to read: the route's mapper
 * translates `console_resend_invite`'s own refusal, and `consoleApiMessage` answers the two codes
 * that carry a failing layer's own wording with the console's own sentence instead.
 */
export async function resendInvite(invite: string): Promise<ResendInviteOutcome> {
  const result = await apiRequest(
    "/api/team/invite",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invite }) },
    resentSchema,
  );
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}

// DELETE /api/team/invite answers `{ ok: true }` and nothing more: a revoked invite falls out of
// console_team's pending list entirely (`where revoked_at is null`), so there is nothing to report
// back that the refreshed list will not show by its absence.
const revokedSchema = z.object({ ok: z.literal(true) }).strict();

export type RevokeInviteOutcome = { readonly kind: "done" } | { readonly kind: "failed"; readonly message: string };

/**
 * Revokes one pending invite (task-7, ConsoleTeam.dc.html's dlg_revoke). Called only after
 * ConfirmItsYou's `onConfirmed` fires -- a completed tap -- never before: unlike the resend above,
 * this withdraws access that was granted, and `console_revoke_invite` calls `console.use_tap` itself.
 *
 * No address is sent, although the tap is minted over one: `console.use_tap('Revoked an invite',
 * p_invite::text, v_invite.email, …)` digests the address the database reads for the invite under a
 * lock, so the browser's own copy is what is being checked rather than what is being passed. The
 * same reasoning `removeMember` gives for not sending a role, and the route's `.strict()` body
 * enforces it.
 *
 * `invite` goes through untouched and `reason` exactly as the member typed it -- only the route's own
 * `tapReason` import trims and digests it, so a second trim here would risk the two disagreeing.
 */
export async function revokeInvite(invite: string, reason: string): Promise<RevokeInviteOutcome> {
  const result = await apiRequest(
    "/api/team/invite",
    { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ invite, reason }) },
    revokedSchema,
  );
  return result.ok ? { kind: "done" } : { kind: "failed", message: consoleApiMessage(result.error) };
}
