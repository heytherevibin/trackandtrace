import { z } from "zod";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { tapReason } from "@/console/keys/tap";
import { assertSameOrigin } from "@/console/same-origin";
import { changeMemberRole } from "@/console/team/team";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

// `tapReason`, imported rather than restated: it is the same schema /api/tap/options validated the
// reason with at mint, and its trim transform decided the exact string console.action_digest
// hashed. Imported from @/console/keys/tap rather than ./tap-schema because this route already runs
// server-side (the same split src/app/console/api/keys/mine/route.ts spells out).
//
// `member` is checked as a uuid here as well as by the cast inside console_change_role, so an id
// that is not one is a 400 with a shape complaint rather than a 500 carrying Postgres's own words
// about invalid input syntax. z.guid(), not z.uuid(): the latter enforces the RFC4122
// version/variant nibbles, which real auth.users ids satisfy but which is no part of the shape
// console_team actually promises (@/console/auth/member's own note). The role is checked here for
// the same reason. `.strict()` refuses a body carrying anything else -- there is no fifth field
// this action takes, and `p_environment` in particular is the server's to decide, never a caller's.
const changeRoleBody = z
  .object({
    member: z.guid(),
    role: z.enum(["owner", "admin", "support", "viewer"]),
    reason: tapReason,
  })
  .strict();

/**
 * PATCH /api/team/member -- change a member's role (Task 5, ConsoleTeam.dc.html's dlg_role).
 * Follows a tap: ConfirmItsYou verifies the Owner first (spec §D steps 1-2, the challenge stays
 * unspent) and only a completed tap ever reaches here. `console_change_role` re-verifies everything
 * itself -- the Owner floor, the self-demotion rule, the last-Owner floor and the tap's own digest
 * -- so this handler adds no check of its own beyond the same-origin and shape validation every
 * mutating console route has.
 *
 * It also adds nothing after the change. `console_change_role` revokes every session the member
 * holds and writes its own audit row inside the same transaction; doing either from here would be a
 * second half of one action, outside the transaction that makes it atomic.
 *
 * `member` reaches the database exactly as the browser sent it -- the same string `console_team`
 * put on the page and the same string the tap was minted over. Lower-casing, trimming or
 * re-formatting it here would spend against a digest the tap was never taken for
 * (task-5-addendum.md §4).
 */
export async function PATCH(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("owner");
    const { member, role, reason } = await readBody(req, changeRoleBody);
    await changeMemberRole(member, role, reason, consoleEnvironment());
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
