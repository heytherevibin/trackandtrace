import { z } from "zod";
import { createConsoleDb, type ConsoleDb } from "@/console/auth/db";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

export type TeamMemberStatus = "active" | "setup";

export interface TeamMember {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly role: ConsoleRole;
  readonly status: TeamMemberStatus;
  readonly keyCount: number;
  readonly lastActiveAt: string | null;
}

export interface TeamInvite {
  readonly id: string;
  readonly email: string;
  readonly role: ConsoleRole;
  readonly sentAt: string;
  readonly expiresAt: string;
}

export interface Team {
  readonly members: readonly TeamMember[];
  readonly invites: readonly TeamInvite[];
}

const roleShape = z.enum(["owner", "admin", "support", "viewer"]);

// console_team() itself (supabase/migrations/20260922090000_console_team.sql) never returns a
// 'removed' member -- its own `where m.status <> 'removed'` excludes them, so a row carrying that
// status here is not this console's ordinary shape. Narrower than console/auth/member.ts's own
// ConsoleMemberStatus on purpose (task-3-addendum.md §3: "a malformed row must fail closed, not
// render as undefined") -- a 'removed' row slipping through would otherwise render a member who no
// longer has access as though they still did.
const memberShape = z.object({
  user_id: z.guid(),
  email: z.string().min(3).max(254),
  name: z.string().min(1).max(120),
  role: roleShape,
  status: z.enum(["active", "setup"]),
  key_count: z.number().int().nonnegative(),
  // Postgres serialises a timestamptz with an offset ("...+00:00"), not the "Z" form
  // (docs/superpowers/plans/2026-09-22-phase-2d2-team.md's own global constraint -- the exact shape
  // that shipped a watchlist production bug once already, src/types/schemas.ts's historyPointSchema
  // carries the same fix). Nullable: a member who accepted an invite but never signed in with a key
  // has no session at all, and last_active_at is `max(sessions.last_seen_at)` over a table that is
  // then empty for them.
  last_active_at: z.iso.datetime({ offset: true }).nullable(),
});

// Never a token_hash (console_team's own comment says so, and its query never selects one) -- there
// is nothing here to omit deliberately, since the column this shape would have to name does not
// exist in the function's return at all.
const inviteShape = z.object({
  id: z.guid(),
  email: z.string().min(3).max(254),
  role: roleShape,
  sent_at: z.iso.datetime({ offset: true }),
  expires_at: z.iso.datetime({ offset: true }),
});

const teamShape = z.object({
  members: z.array(memberShape),
  invites: z.array(inviteShape),
});

// console_invite_member's own return: `jsonb_build_object('invite_id', v_id, 'token', v_token)`,
// where the token is 32 random bytes hex-encoded. Parsed like everything else here -- a token that
// came back the wrong shape is a token that would be mailed to someone as a console-access link.
const newInviteShape = z.object({ invite_id: z.guid(), token: z.string().regex(/^[0-9a-f]{64}$/) });

export interface NewInvite {
  readonly inviteId: string;
  /**
   * The raw invite token, exactly once. It is a console-access credential: the route consumes it
   * server-side for `sendInviteLetter` and never echoes it into the JSON the inviting Owner's
   * browser receives (task-4-addendum.md §3, carried from the Task 2 review's finding I3). A raw
   * token in a response body is a credential sitting in someone's network log.
   */
  readonly token: string;
}

function unavailable(): AppError {
  return new AppError("SOURCE_UNAVAILABLE", consoleMessages.session.unavailable, { status: 503 });
}

/**
 * A thin typed wrapper over `console_team` (spec §E): the roster and the pending invites, in the one
 * round trip the function already makes. Parsed, not cast -- the same precedent
 * src/console/account/my-keys.ts's own getMyKeys sets: a field drifting on console_team must fail
 * closed here, read as "couldn't load", rather than hand the page a shape it treats as real.
 *
 * Makes no access check of its own. The Team page and its GET route
 * (src/app/console/api/team/route.ts) both call `requireConsoleMember("owner")` before this runs --
 * the same split getMyKeys/getMySessions already draw between the guard and the data read -- and
 * console_team() re-checks `console.require_role('owner')` itself regardless, so a caller that
 * somehow skipped the guard still gets nothing back.
 */
export async function getTeam(db?: ConsoleDb): Promise<Team> {
  const client = db ?? (await createConsoleDb());
  const { data, error } = await client.rpc("console_team");
  if (error) throw unavailable();
  const parsed = teamShape.safeParse(data);
  if (!parsed.success) throw unavailable();
  return {
    members: parsed.data.members.map((m) => ({
      userId: m.user_id,
      email: m.email,
      name: m.name,
      role: m.role,
      status: m.status,
      keyCount: m.key_count,
      lastActiveAt: m.last_active_at,
    })),
    invites: parsed.data.invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      sentAt: i.sent_at,
      expiresAt: i.expires_at,
    })),
  };
}

/**
 * `console_invite_member` raises four developer strings a member must never read as sent, and one
 * failure it cannot phrase at all:
 *
 * - 'that address already belongs to a member' -- a console.members row that is not 'removed'.
 * - 'an invite is already open for that address' -- a live console.invites row.
 * - 'that address already has a Trakline account' -- an auth.users row, spec §E line 103, added by
 *   20260922110000_console_invite_blocks_traveller.sql (task-4-addendum.md §2). This is the one
 *   refusal ConsoleTeam.dc.html actually draws (dlg_refused), and the only one that gets its words.
 * - console.use_tap's own 'no tap for this action' -- the four fields the database re-digests differ
 *   from the ones the tap was minted over. Not an outage, so it must not read as one.
 * - a raw 23505 from console_invites_live_email_idx, which is where a concurrent double-invite of a
 *   brand-new address lands: both callers clear the console.invites pre-check and the loser hits the
 *   unique index instead (task-4-addendum.md §3, from the Task 2 review's finding M2). It is the
 *   same fact the pre-check would have reported, so it gets the same sentence rather than a
 *   Postgres constraint name.
 *
 * Anything else is the console's own unavailable line: a driver string, a missing relation, a
 * provider's wording -- none of it written for a member to read.
 */
function fromInviteError(error: { readonly message: string; readonly code?: string }): AppError {
  const m = consoleMessages.team.invite;
  if (error.message.includes("that address already belongs to a member")) return new AppError("INVALID_INPUT", m.alreadyMember, { status: 403 });
  if (error.message.includes("an invite is already open for that address")) return new AppError("INVALID_INPUT", m.alreadyInvited, { status: 403 });
  if (error.message.includes("that address already has a Trakline account")) return new AppError("INVALID_INPUT", m.travellerAccount, { status: 403 });
  if (error.message.includes("no tap for this action")) return new AppError("INVALID_INPUT", m.tapMismatch, { status: 403 });
  // Both the SQLSTATE and the index name, so this keeps holding if PostgREST ever stops forwarding
  // one of them.
  if (error.code === "23505" || error.message.includes("console_invites_live_email_idx")) {
    return new AppError("INVALID_INPUT", m.alreadyInvited, { status: 403 });
  }
  return unavailable();
}

/**
 * A thin typed wrapper over `console_invite_member` (spec §E, Task 4): one invite, written and
 * audited inside the function's own transaction, in exchange for a completed tap.
 *
 * All four arguments go as `text`. Never pass an enum-typed argument to a `public.console_*`
 * function: PostgREST casts it in the caller's context, before `security definer` applies, and the
 * call fails with "permission denied for schema console" (20260921000000_console_enum_args_as_text.sql
 * is the whole phase that cost). `role` is a ConsoleRole here only so a caller cannot pass a string
 * the enum has never heard of; it crosses the wire as its own text.
 *
 * `email` must already be lower-cased by the caller. The database lower-cases it again for its own
 * checks (`v_email := lower(p_email)`) and digests the lower-cased form in `console.use_tap`, so a
 * tap minted over a capital never matches and the invite fails with "no tap for this action" with
 * nothing on screen to say why (task-4-addendum.md §4). The route lower-cases once, before the mint
 * and before this call, so the two can never disagree.
 *
 * `reason` arrives exactly as the shared `tapReason` schema trimmed it at the route boundary and is
 * never re-scrubbed here: `console.write_audit` scrubs at the moment of storage, and scrubbing twice
 * in TypeScript would digest one string while `console.use_tap` recomputes over another.
 *
 * Makes no access check of its own -- the POST route calls `requireConsoleMember("owner")` first,
 * and `console_invite_member` re-checks `console.require_role('owner')` itself regardless.
 */
export async function inviteTeamMember(
  email: string,
  role: ConsoleRole,
  reason: string,
  environment: string,
  db?: ConsoleDb,
): Promise<NewInvite> {
  const client = db ?? (await createConsoleDb());
  const { data, error } = await client.rpc("console_invite_member", { p_email: email, p_role: role, p_reason: reason, p_environment: environment });
  if (error) throw fromInviteError(error);
  const parsed = newInviteShape.safeParse(data);
  if (!parsed.success) throw unavailable();
  return { inviteId: parsed.data.invite_id, token: parsed.data.token };
}

/**
 * `console_change_role` raises three developer strings, and only one of them means anything a
 * member could act on differently:
 *
 * - console.use_tap's own 'no tap for this action' -- the four fields the database re-digests
 *   differ from the ones the tap was minted over. Not an outage, so it must not read as one. This
 *   one is recognised the same way Task 4's own mapper recognises it, and for the same reason: the
 *   sentence a member reads is written once, here, so there is no second copy to drift from.
 * - 'a console needs at least one owner' -- the last-Owner floor, and the self-demotion rule that
 *   shares its words. The browser decided both before any request went out (task-5-addendum.md §3),
 *   so through this console's own UI nothing reaches this line; a race or a hostile caller does.
 * - 'no access' -- a target removed a moment ago, or an Owner demoted in another tab.
 *
 * The last two are answered by their SQLSTATE, not by reading them. Every console refusal raises
 * 42501, and what all of them have in common by the time they get here is that the roster moved
 * underneath the page -- which is what `refused` says, without restating any rule. Matching either
 * string to say "you can't demote the last Owner" would be deciding what a message *means* from
 * its wording, the thing confirm-its-you.tsx's own note rules out: it breaks silently the first
 * time either string is edited, and it would put a second copy of the floor rule in TypeScript,
 * where it cannot be enforced.
 *
 * Anything without that code is not a refusal at all -- a driver string, a missing relation, a
 * provider's wording -- and gets the console's own unavailable line.
 */
function fromChangeRoleError(error: { readonly message: string; readonly code?: string }): AppError {
  const m = consoleMessages.team.changeRole;
  if (error.message.includes("no tap for this action")) return new AppError("INVALID_INPUT", m.tapMismatch, { status: 403 });
  if (error.code === "42501") return new AppError("INVALID_INPUT", m.refused, { status: 403 });
  return unavailable();
}

/**
 * A thin typed wrapper over `console_change_role` (spec §E, Task 5): one member's role, the
 * revocation of every session they hold, and an audit row, all inside the function's own
 * transaction, in exchange for a completed tap.
 *
 * `p_member` is a uuid and everything else is text. Never pass an enum-typed argument to a
 * `public.console_*` function: PostgREST casts it in the caller's context, before `security
 * definer` applies, and the call fails with "permission denied for schema console"
 * (20260921000000_console_enum_args_as_text.sql is the whole phase that cost). `role` is a
 * ConsoleRole here only so a caller cannot pass a string the enum has never heard of; it crosses
 * the wire as its own text.
 *
 * `member` must be the id console_team returned, unchanged. The tap is minted over it in the
 * browser and `console.use_tap` re-digests `p_member::text` -- Postgres's lowercase canonical form
 * -- so anything reshaped in between would spend against a digest the tap was never taken for, and
 * the change would fail with "no tap for this action" with nothing on screen to say why.
 *
 * `reason` arrives exactly as the shared `tapReason` schema trimmed it at the route boundary and is
 * never re-scrubbed here: `console.write_audit` scrubs at the moment of storage, and scrubbing
 * twice in TypeScript would digest one string while `console.use_tap` recomputes over another.
 *
 * Adds nothing to what the function already does. `console_change_role` revokes the member's
 * sessions itself (`console_auth_revoke_member_sessions(p_member, null)`) and writes its own audit
 * row, so a second call from here would be a second, unaudited half of one action.
 *
 * Makes no access check of its own -- the PATCH route calls `requireConsoleMember("owner")` first,
 * and `console_change_role` re-checks `console.require_role('owner')` itself regardless.
 */
export async function changeMemberRole(member: string, role: ConsoleRole, reason: string, environment: string, db?: ConsoleDb): Promise<void> {
  const client = db ?? (await createConsoleDb());
  const { error } = await client.rpc("console_change_role", { p_member: member, p_role: role, p_reason: reason, p_environment: environment });
  if (error) throw fromChangeRoleError(error);
}

/**
 * `console_reset_keys` raises three developer strings, told apart by the only two things in the
 * error that can be trusted -- a substring the function itself raises, and the SQLSTATE:
 *
 * - console.use_tap's own 'no tap for this action'. Here that has one live cause and it is a
 *   genuine race (task-6-addendum.md §3): the function counts the member's keys inside its own
 *   transaction and digests that count, while the browser minted its tap over the count
 *   `console_team` put on the page. A key added or removed in between and the two disagree. Failing
 *   closed is the correct outcome; a developer string on screen is not, and neither is "try again"
 *   without a reload -- the same stale page would mint the same wrong number.
 * - 'no access' -- a target removed a moment ago, or an Owner demoted in another tab.
 * - 'a member cannot reset their own keys' -- the self-check
 *   (20260922120000_console_reset_keys_blocks_self.sql), decided in the browser before any request
 *   goes out, so nothing reaches this line through the console's own UI; a race or a hostile caller
 *   does.
 *
 * The last two are answered by their 42501 rather than by reading them, for the reason
 * fromChangeRoleError spells out above: deciding what a refusal *means* from its wording breaks
 * silently the first time either string is edited.
 *
 * There is deliberately no last-Owner case, and that is a fact about this function rather than an
 * omission: `console_reset_keys` never touches `role` or `status`, so it cannot leave a console
 * short of an Owner. The self-check is the guard it does have, and it is unconditional. Task 6
 * first shipped without it, on the addendum's claim that a self-reset was "recoverable, and
 * consistent with My keys letting a member remove their own keys" -- both halves false, and the
 * second inverted: `console_remove_key` refuses below a floor of two precisely so a member can
 * never reach zero keys. The migration carries the full trace of what a self-reset actually did.
 */
function fromResetKeysError(error: { readonly message: string; readonly code?: string }): AppError {
  const m = consoleMessages.team.resetKeys;
  if (error.message.includes("no tap for this action")) return new AppError("INVALID_INPUT", m.tapMismatch, { status: 403 });
  if (error.code === "42501") return new AppError("INVALID_INPUT", m.refused, { status: 403 });
  return unavailable();
}

/**
 * A thin typed wrapper over `console_reset_keys` (spec §E, Task 6): every one of a member's keys,
 * the revocation of every session they hold, the `keys_reset_at`/`keys_reset_by` stamp on their
 * row, and an audit row, all inside the function's own transaction, in exchange for a completed tap.
 *
 * Returns how many keys went -- the function's own `return v_count`, counted before the delete and
 * inside the same transaction. Parsed, never cast, the same way `signOutOtherSessions` parses its
 * own count (src/console/account/my-sessions.ts): a caller builds a sentence for a member out of
 * this number, so a shape that drifted must read as "couldn't load" rather than reach a screen as
 * "NaN keys removed".
 *
 * `p_member` is a uuid and everything else is text. Never pass an enum-typed argument to a
 * `public.console_*` function: PostgREST casts it in the caller's context, before `security
 * definer` applies, and the call fails with "permission denied for schema console"
 * (20260921000000_console_enum_args_as_text.sql is the whole phase that cost).
 *
 * `member` must be the id console_team returned, unchanged -- `console.use_tap` re-digests
 * `p_member::text`, Postgres's lowercase canonical form -- and `reason` arrives exactly as the
 * shared `tapReason` schema trimmed it at the route boundary, never re-scrubbed here. Both for the
 * same reason as every other tap-spending call in this file: a string reshaped in between spends
 * against a digest the tap was never taken for.
 *
 * Adds nothing to what the function already does. It revokes the member's sessions itself
 * (`console_auth_revoke_member_sessions(p_member, null)`) and writes its own audit row.
 *
 * Makes no access check of its own -- the DELETE route calls `requireConsoleMember("owner")` first,
 * and `console_reset_keys` re-checks `console.require_role('owner')` and its own self-check
 * regardless.
 */
export async function resetMemberKeys(member: string, reason: string, environment: string, db?: ConsoleDb): Promise<number> {
  const client = db ?? (await createConsoleDb());
  const { data, error } = await client.rpc("console_reset_keys", { p_member: member, p_reason: reason, p_environment: environment });
  if (error) throw fromResetKeysError(error);
  const parsed = z.number().int().nonnegative().safeParse(data);
  if (!parsed.success) throw unavailable();
  return parsed.data;
}

/**
 * `console_remove_member` raises the same three developer strings `console_change_role` does, and
 * they are answered the same way and for the same reasons -- see fromChangeRoleError above. Only
 * the tap's own sentence differs: the value this function digests is the target's *current* role,
 * read under a lock, against the role this page rendered, so a mismatch means their role moved
 * rather than that any choice here was stale (task-6-addendum.md §3).
 */
function fromRemoveMemberError(error: { readonly message: string; readonly code?: string }): AppError {
  const m = consoleMessages.team.removeMember;
  if (error.message.includes("no tap for this action")) return new AppError("INVALID_INPUT", m.tapMismatch, { status: 403 });
  if (error.code === "42501") return new AppError("INVALID_INPUT", m.refused, { status: 403 });
  return unavailable();
}

/**
 * A thin typed wrapper over `console_remove_member` (spec §E, Task 6): one member's access, the
 * revocation of every session they hold, and an audit row, all inside the function's own
 * transaction, in exchange for a completed tap.
 *
 * A soft delete. The function sets `status = 'removed'`; the row stays, and so does the audit trail
 * naming them. `console_team` then leaves them out of the roster entirely (`where m.status <>
 * 'removed'`), which is why the page's own `router.refresh()` is all the list needs afterwards.
 *
 * `p_member` is a uuid and both other arguments are text -- and there is no role argument at all,
 * unlike changeMemberRole: the role the tap was minted over is the one the database reads for
 * itself, never one a caller asserts.
 *
 * `member` unchanged and `reason` un-rescrubbed, for the same digest reasons as every other
 * tap-spending call in this file.
 *
 * Makes no access check of its own -- the DELETE route calls `requireConsoleMember("owner")` first,
 * and `console_remove_member` re-checks `console.require_role('owner')`, the unconditional
 * self-check and the last-Owner floor itself regardless.
 */
export async function removeTeamMember(member: string, reason: string, environment: string, db?: ConsoleDb): Promise<void> {
  const client = db ?? (await createConsoleDb());
  const { error } = await client.rpc("console_remove_member", { p_member: member, p_reason: reason, p_environment: environment });
  if (error) throw fromRemoveMemberError(error);
}

// `console_resend_invite`'s own return: `jsonb_build_object('invite_id', …, 'token', …, 'email', …,
// 'role', …)`. The address and the role travel with the token because the caller's next act is to
// send the letter, and a second round trip to read back a row the function already had in hand
// would be one more place for the two to disagree (the migration says so itself).
const resentInviteShape = z.object({
  invite_id: z.guid(),
  token: z.string().regex(/^[0-9a-f]{64}$/),
  email: z.string().min(3).max(254),
  role: roleShape,
});

export interface ResentInvite {
  readonly inviteId: string;
  /**
   * The freshly minted raw invite token, exactly once, and exactly as dangerous as the first one:
   * the route consumes it server-side for `sendInviteLetter` and never echoes it into the JSON the
   * resending Owner's browser receives (task-7-addendum.md §4, carried from task-4-addendum.md §3
   * and the Task 2 review's finding I3).
   */
  readonly token: string;
  /** The address the invite was always for, as stored -- never one a caller supplied. */
  readonly email: string;
  readonly role: ConsoleRole;
}

/**
 * `console_resend_invite` raises one refusal of its own -- 'no access', for an invite that is gone,
 * already accepted or already revoked -- and `console.require_role('owner')` raises its own for a
 * caller who is not an Owner. Both arrive with 42501, and by the time they reach here they mean the
 * same thing to a member: the pending list this page rendered has moved. Answered by the SQLSTATE
 * rather than by reading the words, for the reason fromChangeRoleError spells out above.
 *
 * There is deliberately no tap case. This function spends no tap at all: resending changes no
 * access, so it takes neither a reason nor a ceremony (task-7-brief.md's own ruling).
 *
 * There is no expiry case either, and that is the point. An expired invite is resendable on purpose
 * -- `console_invites_live_email_idx` holds the address while an invite is neither accepted nor
 * revoked and expiry does not release it, so refusing here would leave an Owner unable to resend
 * *and* unable to invite that address again (task-7-addendum.md §1, and the migration's own comment
 * at the point where a refusal would have gone). task-7-brief.md's last test asks for the opposite;
 * it is wrong, and task-7-report.md records it.
 */
function fromResendInviteError(error: { readonly message: string; readonly code?: string }): AppError {
  if (error.code === "42501") return new AppError("INVALID_INPUT", consoleMessages.team.resendInvite.refused, { status: 403 });
  return unavailable();
}

/**
 * A thin typed wrapper over `console_resend_invite` (spec §E, Task 7): a fresh token on the invite's
 * row, its `sent_at`/`created_at`/`expires_at` clock restarted, and an audit row, all inside the
 * function's own transaction -- and no tap, unlike every other mutating call in this file.
 *
 * `p_invite` is a uuid and `p_environment` is text. Never pass an enum-typed argument to a
 * `public.console_*` function: PostgREST casts it in the caller's context, before `security
 * definer` applies, and the call fails with "permission denied for schema console"
 * (20260921000000_console_enum_args_as_text.sql is the whole phase that cost).
 *
 * Parsed, never cast, the same precedent `inviteTeamMember` sets for the first token: a token that
 * came back the wrong shape is a token that would be mailed to someone as a console-access link.
 *
 * Makes no access check of its own -- the POST route calls `requireConsoleMember("owner")` first,
 * and `console_resend_invite` re-checks `console.require_role('owner')` itself regardless.
 */
export async function resendTeamInvite(invite: string, environment: string, db?: ConsoleDb): Promise<ResentInvite> {
  const client = db ?? (await createConsoleDb());
  const { data, error } = await client.rpc("console_resend_invite", { p_invite: invite, p_environment: environment });
  if (error) throw fromResendInviteError(error);
  const parsed = resentInviteShape.safeParse(data);
  if (!parsed.success) throw unavailable();
  return { inviteId: parsed.data.invite_id, token: parsed.data.token, email: parsed.data.email, role: parsed.data.role };
}

/**
 * `console_revoke_invite` raises 'no access' for an invite that is gone, accepted or already
 * revoked, and `console.use_tap` its own 'no tap for this action'. Told apart the same way every
 * other mapper in this file tells them apart -- a substring the function itself raises, then the
 * SQLSTATE -- and the tap's own sentence differs from the member actions': the four fields this one
 * digests are the invite's id and its address, neither of which moves while the invite is live, so
 * a mismatch is a tap spent or minted for something else rather than a page gone stale.
 */
function fromRevokeInviteError(error: { readonly message: string; readonly code?: string }): AppError {
  const m = consoleMessages.team.revokeInvite;
  if (error.message.includes("no tap for this action")) return new AppError("INVALID_INPUT", m.tapMismatch, { status: 403 });
  if (error.code === "42501") return new AppError("INVALID_INPUT", m.refused, { status: 403 });
  return unavailable();
}

/**
 * A thin typed wrapper over `console_revoke_invite` (spec §E, Task 7): the invite's `revoked_at`
 * stamp and an audit row, inside the function's own transaction, in exchange for a completed tap.
 *
 * `p_invite` is a uuid and both other arguments are text. `invite` must be the id `console_team`
 * returned, unchanged -- `console.use_tap` re-digests `p_invite::text`, Postgres's lowercase
 * canonical form -- and `reason` arrives exactly as the shared `tapReason` schema trimmed it at the
 * route boundary, never re-scrubbed here. Both for the same reason as every other tap-spending call
 * in this file: a string reshaped in between spends against a digest the tap was never taken for.
 *
 * Nothing is sent. A revoked invite's letter is already out; what stops working is the link, because
 * the row it redeems against is no longer live -- there is no second letter to write.
 *
 * Makes no access check of its own -- the DELETE route calls `requireConsoleMember("owner")` first,
 * and `console_revoke_invite` re-checks `console.require_role('owner')` itself regardless.
 */
export async function revokeTeamInvite(invite: string, reason: string, environment: string, db?: ConsoleDb): Promise<void> {
  const client = db ?? (await createConsoleDb());
  const { error } = await client.rpc("console_revoke_invite", { p_invite: invite, p_reason: reason, p_environment: environment });
  if (error) throw fromRevokeInviteError(error);
}
