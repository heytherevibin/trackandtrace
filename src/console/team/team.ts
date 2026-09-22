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
