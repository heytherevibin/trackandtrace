import { z } from "zod";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { tapReason } from "@/console/keys/tap";
import { assertSameOrigin } from "@/console/same-origin";
import { resetMemberKeys } from "@/console/team/team";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

// `tapReason`, imported rather than restated: it is the same schema /api/tap/options validated the
// reason with at mint, and its trim transform decided the exact string console.action_digest
// hashed. Imported from @/console/keys/tap rather than ./tap-schema because this route already runs
// server-side (the same split src/app/console/api/keys/mine/route.ts spells out).
//
// `member` is checked as a uuid here as well as by the cast inside console_reset_keys, so an id
// that is not one is a 400 with a shape complaint rather than a 500 carrying Postgres's own words
// about invalid input syntax. z.guid(), not z.uuid(): the latter enforces the RFC4122
// version/variant nibbles, which real auth.users ids satisfy but which is no part of the shape
// console_team actually promises (@/console/auth/member's own note).
//
// `.strict()` refuses a body carrying anything else. The key count in particular has no business
// here even though the tap is minted over it: `console_reset_keys` counts the member's keys inside
// its own transaction and digests that, so a count in the body would be a caller's claim about a
// fact the database is about to establish for itself. And `p_environment` is always the server's to
// decide, never a caller's.
const resetKeysBody = z.object({ member: z.guid(), reason: tapReason }).strict();

/**
 * DELETE /api/team/keys -- reset one member's keys (Task 6, ConsoleTeam.dc.html's dlg_reset).
 * Follows a tap: ConfirmItsYou verifies the Owner first (spec §D steps 1-2, the challenge stays
 * unspent) and only a completed tap ever reaches here. `console_reset_keys` re-verifies everything
 * itself -- the Owner floor, the target's existence, and the tap's own digest over the key count it
 * recomputes -- so this handler adds no check of its own beyond the same-origin and shape
 * validation every mutating console route has.
 *
 * It also adds nothing after the reset. The function revokes every session the member holds, stamps
 * `keys_reset_at`/`keys_reset_by` and writes its own audit row inside the same transaction; doing
 * any of it from here would be a second half of one action, outside the transaction that makes it
 * atomic.
 *
 * Unlike every other mutating team route, this one answers with more than `{ ok: true }`: the count
 * of keys deleted, which is `console_reset_keys`' own return value and what task-6-brief.md means
 * by "a reset reports how many keys went". A count is not a credential -- it is the same number
 * `console_team` already puts on the page -- so it crosses the wire where the invite's raw token
 * never may (task-4-addendum.md §3).
 *
 * DELETE rather than POST because that is what this does: every one of the member's keys is
 * deleted. It is the bulk sibling of DELETE /api/keys/mine, run by an Owner on someone else's
 * account rather than by a member on their own, and it carries a body for the same reason that one
 * does -- the reason the tap was minted over has to travel with it.
 */
export async function DELETE(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("owner");
    const { member, reason } = await readBody(req, resetKeysBody);
    const count = await resetMemberKeys(member, reason, consoleEnvironment());
    return jsonOk({ ok: true, count });
  } catch (err) {
    return jsonError(err);
  }
}
