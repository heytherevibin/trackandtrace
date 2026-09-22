import { after } from "next/server";
import { z } from "zod";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { sendInviteLetter } from "@/console/email/invite";
import { consoleOrigin } from "@/console/hosts";
import { tapReason } from "@/console/keys/tap";
import { assertSameOrigin } from "@/console/same-origin";
import { resendTeamInvite, revokeTeamInvite } from "@/console/team/team";
import { jsonError, jsonOk } from "@/services/api-response";
import { env } from "@/services/env";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

// One field and no more. A reason in particular has no business here: `console_resend_invite` takes
// no `p_reason` and spends no tap, so a body carrying one would be a caller asserting a ceremony
// that never happened -- and `p_environment` is always the server's to decide, never a caller's.
//
// `invite` is checked as a uuid here as well as by the cast inside the function, so an id that is
// not one is a 400 with a shape complaint rather than a 500 carrying Postgres's own words about
// invalid input syntax. z.guid(), not z.uuid(): the latter enforces the RFC4122 version/variant
// nibbles, which is no part of the shape console_team actually promises (@/console/auth/member's
// own note).
const resendBody = z.object({ invite: z.guid() }).strict();

/**
 * POST /api/team/invite -- resend one pending invite (Task 7, ConsoleTeam.dc.html's dlg_resend).
 *
 * The one mutating team route that follows no tap. Resending re-sends a letter to an address an
 * Owner already approved and changes no access, so it takes no ceremony -- the same
 * rename-versus-remove reasoning 2d-1 used, and `console_resend_invite`'s own signature, which has
 * no `p_reason` to spend one with. What it does have is the Owner floor, re-checked inside the
 * function, plus the same-origin and shape validation every mutating console route carries.
 *
 * An expired invite is resent, not refused. `console_invites_live_email_idx` holds the address while
 * an invite is neither accepted nor revoked and expiry does not release it, so refusing would leave
 * an Owner unable to resend *and* unable to invite that address again (task-7-addendum.md §1).
 *
 * Two things this route is careful about, each one a finding from an earlier task's review:
 *
 * 1. The fresh raw token never enters the response. It is consumed here, server-side, for the
 *    letter; the Owner's browser gets `{ ok: true }` and nothing else (task-7-addendum.md §4,
 *    carried from task-4-addendum.md §3). A resend's token is exactly as much a console-access
 *    credential as the first one was.
 * 2. The origin comes from `consoleOrigin(req.headers.get("host"), …)`, never `new URL(req.url)` --
 *    the proxy rewrites every request, and a member-facing link must never be assemblable from
 *    client input. POST /api/team is the same pattern.
 *
 * The address and role go to the letter as `console_resend_invite` returned them -- the row's own,
 * never anything a caller sent -- so a resend cannot be steered at a different address than the one
 * the invite was written for.
 *
 * `sendInviteLetter` never throws and refuses an empty origin on its own, so `after()` is safe: the
 * new token is already the live one whether or not the letter goes out, and pressing Resend again is
 * the whole recovery.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const member = await requireConsoleMember("owner");
    const { invite } = await readBody(req, resendBody);
    const { token, email, role } = await resendTeamInvite(invite, consoleEnvironment());
    const origin = consoleOrigin(req.headers.get("host"), env().VERCEL_ENV);
    after(() => sendInviteLetter({ to: email, token, role, invitedBy: member.name, origin }));
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

// `tapReason`, imported rather than restated: it is the same schema /api/tap/options validated the
// reason with at mint, and its trim transform decided the exact string console.action_digest hashed.
// Imported from @/console/keys/tap rather than ./tap-schema because this route already runs
// server-side (the same split src/app/console/api/keys/mine/route.ts spells out).
//
// Two fields and no more. There is deliberately no `email` here even though the tap is minted over
// one: `console.use_tap('Revoked an invite', p_invite::text, v_invite.email, …)` digests the address
// the *database* reads for the invite, under a lock, so an address in the body would be a caller's
// claim about a fact the database is about to check for itself.
const revokeBody = z.object({ invite: z.guid(), reason: tapReason }).strict();

/**
 * DELETE /api/team/invite -- revoke one pending invite (Task 7, ConsoleTeam.dc.html's dlg_revoke).
 *
 * Follows a tap, unlike the resend above: revoking withdraws access that was granted.
 * `ConfirmItsYou` verifies the Owner first (spec §D steps 1-2, the challenge stays unspent) and only
 * a completed tap ever reaches here; `console_revoke_invite` re-verifies everything itself -- the
 * Owner floor, the invite's liveness, and the tap's own digest -- so this handler adds no check of
 * its own beyond the same-origin and shape validation every mutating console route has.
 *
 * It also adds nothing after the revocation, and sends nothing: the function stamps `revoked_at` and
 * writes its own audit row inside the same transaction, and the letter already out stops working
 * because the row it redeems against is no longer live.
 *
 * `invite` reaches the database exactly as the browser sent it -- the same string `console_team` put
 * on the page and the same string the tap was minted over.
 */
export async function DELETE(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("owner");
    const { invite, reason } = await readBody(req, revokeBody);
    await revokeTeamInvite(invite, reason, consoleEnvironment());
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
