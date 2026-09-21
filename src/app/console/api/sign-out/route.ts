import { assertConsoleAvailable } from "@/console/availability";
import { createConsoleDb } from "@/console/auth/db";
import { sessionIdFromClaims } from "@/console/auth/member";
import { endConsoleSession } from "@/console/auth/session";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";

export const dynamic = "force-dynamic";

/**
 * Sign out. The console session row is the authority -- `console.current_member()` refuses a
 * revoked row regardless of what the cookie still holds -- so it is revoked first; if clearing the
 * cookie then fails, the session is already dead either way. A claims set with no session id (spec
 * §C's session-less edge) still clears the cookie: there is nothing to revoke, but the browser must
 * not be left holding a token.
 *
 * `{ scope: "local" }`: auth-js defaults to "global", which would also revoke this person's
 * trakline.in sessions -- exactly the cross-host bleed this whole branch exists to prevent. The
 * console session row above is already the authority for console access, so global scope buys
 * nothing here and only costs the traveller side. Same reasoning at the other two call sites that
 * end a Supabase session on the console: src/app/console/auth/confirm/route.ts and
 * src/console/setup/redeem.ts.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const db = await createConsoleDb();
    const claims = await db.auth.getClaims();
    const sessionId = sessionIdFromClaims(claims.data?.claims);
    if (sessionId) await endConsoleSession(sessionId);
    await db.auth.signOut({ scope: "local" });
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
