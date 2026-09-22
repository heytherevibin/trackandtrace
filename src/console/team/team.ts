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
