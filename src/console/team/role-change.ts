import type { ConsoleRole } from "@/console/auth/member";

// The two facts a role change -- or a removal -- needs before it can be offered, decided in the
// browser from the roster the Team page already holds (task-5-addendum.md §3, task-6-addendum.md §4).
//
// Deciding them here is not a shortcut past the database. `console_change_role` and
// `console_remove_member` re-check both themselves and refuse regardless -- that is the security
// boundary, and this file is not. What this file buys is the sheet's own dlg_owner ("A console
// needs at least one Owner" / "Make someone else Owner first.") instead of a refusal nobody can
// read: the database raises one developer string, 'a console needs at least one owner', for two
// different cases in each of two functions, with SQLSTATE 42501 -- the very same code every other
// console refusal raises, down to console.use_tap's "no tap for this action". There is nothing in
// that error to tell the cases apart by, and reading its *words* to find out is what
// confirm-its-you.tsx's own note rules out: it breaks silently the first time either string is
// edited, which is the moment it was supposed to help.

/** The sheet's own order, top to bottom (ConsoleTeam.dc.html:215-218). */
export const CONSOLE_ROLES = ["owner", "admin", "support", "viewer"] as const satisfies readonly ConsoleRole[];

/** Only what the guard actually reads of a member: never the whole row, so a caller cannot pass one by accident. */
export interface RoleChangeTarget {
  readonly userId: string;
  readonly role: ConsoleRole;
}

export interface RoleChangeRoster {
  /** The Owner reading the page -- `requireConsoleMember()`'s own `userId`, which the page already has. */
  readonly signedInId: string;
  /** How many members are Owners *and* active. Exactly what console.require_another_active_owner() counts. */
  readonly activeOwners: number;
}

/**
 * Whether this change would leave the console without an Owner -- the two cases
 * `console_change_role` refuses with 'a console needs at least one owner', mirrored line for line
 * from supabase/migrations/20260922090000_console_team.sql:162-217:
 *
 * - `if p_member = v_member.user_id then raise` -- an Owner acting on their own row. Unconditional,
 *   checked before the target row is even read, and refused whatever the new role is and however
 *   many other Owners are standing by. The sheet's "Make someone else Owner first." is not merely
 *   the floor below it.
 * - `if v_target.role = 'owner' and v_role is distinct from 'owner' then require_another_active_owner()`,
 *   which raises when `count(*) where role = 'owner' and status = 'active'` is at most one. Note
 *   what that count is over: every active Owner in the console, never the *target's* own status --
 *   so an Owner still in setup is refused too, while the signed-in Owner is the only active one.
 *   This counts the same thing rather than asking whether the target "is the only active Owner",
 *   which would answer differently for exactly that member.
 *
 * `next` is the role the member is left holding, so a **removal passes `null`**: a removed member
 * holds no role at all (task-6-addendum.md §4). That is not a second guard bolted on -- it is the
 * same two lines, because `console_remove_member` (:259-305) carries the identical self-check and
 * then `if v_target.role = 'owner' then require_another_active_owner()`, which is the role-change
 * arm with `v_role is distinct from 'owner'` already decided: nothing a removal leaves behind is an
 * Owner. Widening this predicate is what keeps one copy of the floor rule in the browser rather
 * than two that can drift, and the console never decides it by reading the database's refusal --
 * one developer string, SQLSTATE 42501, shared with every other console refusal.
 *
 * Where this and the migration ever disagree, the migration is right and this is the thing that is
 * wrong.
 */
export function needsAnotherOwner(target: RoleChangeTarget, next: ConsoleRole | null, roster: RoleChangeRoster): boolean {
  if (target.userId === roster.signedInId) return true;
  return target.role === "owner" && next !== "owner" && roster.activeOwners <= 1;
}

/**
 * The roles the picker offers for a member: all four bar the one they already hold, in the sheet's
 * own order. Changing a role to the role it already is is not a change, and the brief's own test
 * list requires the row's own role not to be offered.
 */
export function rolesOfferedInstead(current: ConsoleRole): readonly ConsoleRole[] {
  return CONSOLE_ROLES.filter((role) => role !== current);
}
