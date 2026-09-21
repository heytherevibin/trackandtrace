import { getMySessions, signOutOtherSessions } from "@/console/account/my-sessions";
import { assertConsoleAvailable } from "@/console/availability";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";

export const dynamic = "force-dynamic";

/**
 * GET /api/sessions -- the signed-in member's own sessions (task-9), the Sessions plate's source of
 * truth the same way GET /api/keys/mine is the Keys plate's: the My keys page renders this data
 * server-side on first load and does not call this route itself; this is the surface the client
 * component re-fetches from once a sign-out lands.
 */
export async function GET(): Promise<Response> {
  try {
    assertConsoleAvailable();
    await requireConsoleMember();
    const sessions = await getMySessions();
    return jsonOk({ ok: true, sessions });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * DELETE /api/sessions -- sign every other session out (task-9). No body and no tap:
 * console_sign_out_others takes only the caller's own environment, because this action only ever
 * reduces the caller's own access (the same reasoning Task 1 gave for ConfirmItsYou not being the
 * right dialog here). Same-origin is still asserted, the same way every other mutating console
 * route asserts it, since this changes state even though it needs no tap.
 */
export async function DELETE(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember();
    const count = await signOutOtherSessions(consoleEnvironment());
    return jsonOk({ ok: true, count });
  } catch (err) {
    return jsonError(err);
  }
}
