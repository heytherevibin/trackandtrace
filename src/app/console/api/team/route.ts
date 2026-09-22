import { after } from "next/server";
import { z } from "zod";
import { assertConsoleAvailable } from "@/console/availability";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { sendInviteLetter } from "@/console/email/invite";
import { consoleOrigin } from "@/console/hosts";
import { tapReason } from "@/console/keys/tap";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { getTeam, inviteTeamMember } from "@/console/team/team";
import { jsonError, jsonOk } from "@/services/api-response";
import { env } from "@/services/env";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * GET /api/team -- the Owner-only roster and pending invites (Task 3), in the one round trip
 * `console_team` already makes. The Team page (src/app/console/team/page.tsx) renders this data
 * server-side on first load and does not call this route itself, the same way every other console
 * page reads its own data directly rather than fetching its own API
 * (src/app/console/api/keys/mine/route.ts's own comment).
 *
 * Task 3's comment here promised a client re-fetch from this route "once Tasks 4-7 exist to mutate
 * what it shows", and Task 4's own note then moved that promise on to Tasks 5-7. **Nobody took it
 * up, and nobody should have.** All four mutating tasks landed with the three plates still server
 * components: only the row menu and the row actions inside each Actions cell are "use client", and
 * every one of them refreshes with `router.refresh()` so the page re-runs `getTeam()` server-side
 * and the refreshed list cannot disagree with the first paint (task-4-addendum.md §5, Ruling 14;
 * src/console/team/team-client.ts:13-18 records the tasks declining it).
 *
 * So this route has one caller shape and it is not the browser: anything server-side that wants
 * the roster in one round trip. Leaving it as a promise about the next task made it read as
 * half-finished work for three tasks after the decision was taken.
 */
export async function GET(): Promise<Response> {
  try {
    assertConsoleAvailable();
    await requireConsoleMember("owner");
    const { members, invites } = await getTeam();
    return jsonOk({ ok: true, members, invites });
  } catch (err) {
    return jsonError(err);
  }
}

// `tapReason`, imported rather than restated: it is the same schema /api/tap/options validated the
// reason with at mint, and its trim transform decided the exact string console.action_digest hashed.
// Imported from @/console/keys/tap rather than ./tap-schema because this route already runs
// server-side (the same split src/app/console/api/keys/mine/route.ts spells out). The role is
// checked here as well as by the enum cast inside console_invite_member, so a bad one is a 400 with
// a shape complaint rather than a 500 carrying Postgres's own words.
const inviteBody = z
  .object({
    email: z.email({ message: consoleMessages.team.invite.invalidEmail }).max(254),
    role: z.enum(["owner", "admin", "support", "viewer"]),
    reason: tapReason,
  })
  .strict();

/**
 * POST /api/team -- invite a member (Task 4, Form TC-04). Follows a tap: ConfirmItsYou verifies the
 * Owner first (spec §D steps 1-2, the challenge stays unspent) and only a completed tap ever reaches
 * here. `console_invite_member` re-verifies everything itself -- the Owner floor, the three
 * refusals, and the tap's own digest -- so this handler adds no check of its own beyond the
 * same-origin and shape validation every mutating console route has.
 *
 * Three things this route is careful about, each one a finding from an earlier task's review:
 *
 * 1. The raw token never enters the response. It is consumed here, server-side, for the letter; the
 *    Owner's browser gets `{ ok: true }` and nothing else (task-4-addendum.md §3).
 * 2. The origin comes from `consoleOrigin(req.headers.get("host"), …)`, never `new URL(req.url)` --
 *    the proxy rewrites every request, and a member-facing link must never be assemblable from
 *    client input. src/app/console/api/sign-in/route.ts is the same pattern.
 * 3. The address is lower-cased once, here, before both the tap's own mint (the dialog does the
 *    same) and this call. `console_invite_member` digests the lower-cased form, so anything else
 *    would spend against a digest the tap was never taken for.
 *
 * `sendInviteLetter` never throws and refuses an empty origin on its own, so `after()` is safe: an
 * invite already written to the database is a valid invite whether or not the letter goes out, and
 * Task 7's resend exists for exactly that.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const member = await requireConsoleMember("owner");
    const { email, role, reason } = await readBody(req, inviteBody);
    const address = email.toLowerCase();
    const { token } = await inviteTeamMember(address, role, reason, consoleEnvironment());
    const origin = consoleOrigin(req.headers.get("host"), env().VERCEL_ENV);
    after(() => sendInviteLetter({ to: address, token, role, invitedBy: member.name, origin }));
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
