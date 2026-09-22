import { describe, expect, it } from "vitest";
import type { ConsoleRole } from "@/console/auth/member";
import { CONSOLE_ROLES, needsAnotherOwner, rolesOfferedInstead } from "@/console/team/role-change";

// The last-Owner guard, decided in the browser from the roster the page already has
// (task-5-addendum.md §3). The database's own check in console_change_role stays the security
// boundary and still refuses -- but its message is a developer string ('a console needs at least
// one owner') that must never reach the screen, and it raises 42501 exactly like every other
// console refusal, so the console cannot tell the two cases apart from the error alone. Deciding
// it here is what lets the sheet's own dlg_owner be drawn with the sheet's own words.
//
// Every assertion below is a mirror of a line in console_change_role
// (supabase/migrations/20260922090000_console_team.sql:162-217). Where the two could drift, the
// migration wins and this file is the thing that is wrong.

const ME = "aaaaaaaa-0000-0000-0000-000000000001";
const THEM = "aaaaaaaa-0000-0000-0000-000000000002";

describe("needsAnotherOwner", () => {
  // `if p_member = v_member.user_id then raise` -- checked before the target row is even read, and
  // refused whatever the new role is and however many Owners are standing by.
  it("refuses an Owner acting on their own row, whatever the new role and however many Owners there are", () => {
    for (const role of CONSOLE_ROLES) {
      expect(needsAnotherOwner({ userId: ME, role: "owner" }, role, { signedInId: ME, activeOwners: 4 }), role).toBe(true);
    }
  });

  // `if v_target.role = 'owner' and v_role is distinct from 'owner' then require_another_active_owner()`,
  // which raises when `count(active owners) <= 1`. Note what that count is over: every active Owner
  // in the console, not the target's own status -- so an Owner still in setup is refused too while
  // the signed-in Owner is the only active one. This predicate counts the same thing for the same
  // reason, rather than asking whether the target is "the only active Owner".
  it("refuses demoting an Owner when the console has only one active Owner left", () => {
    expect(needsAnotherOwner({ userId: THEM, role: "owner" }, "admin", { signedInId: ME, activeOwners: 1 })).toBe(true);
  });

  it("allows demoting an Owner once a second active Owner stands", () => {
    expect(needsAnotherOwner({ userId: THEM, role: "owner" }, "admin", { signedInId: ME, activeOwners: 2 })).toBe(false);
  });

  // `is distinct from 'owner'`: setting an Owner to Owner takes nothing away, so the floor never
  // applies, even with one active Owner in the whole console.
  it("allows setting an Owner to Owner even with one active Owner in the console", () => {
    expect(needsAnotherOwner({ userId: THEM, role: "owner" }, "owner", { signedInId: ME, activeOwners: 1 })).toBe(false);
  });

  it("allows changing someone who is not an Owner, whatever the Owner count", () => {
    for (const role of CONSOLE_ROLES) {
      expect(needsAnotherOwner({ userId: THEM, role: "support" }, role, { signedInId: ME, activeOwners: 1 }), role).toBe(false);
    }
  });
});

describe("rolesOfferedInstead", () => {
  // task-5-brief.md's own test list: "the row's own role is not offered as the new one".
  it("leaves the member's current role out", () => {
    expect(rolesOfferedInstead("support")).toEqual(["owner", "admin", "viewer"]);
    expect(rolesOfferedInstead("owner")).toEqual(["admin", "support", "viewer"]);
  });

  // ConsoleTeam.dc.html:215-218's own order, top to bottom, the same one the invite's picker keeps.
  it("keeps the sheet's own order for the three that are left", () => {
    for (const current of CONSOLE_ROLES) {
      const offered = rolesOfferedInstead(current);
      expect(offered).toHaveLength(3);
      expect(offered).toEqual(CONSOLE_ROLES.filter((role: ConsoleRole) => role !== current));
    }
  });
});
