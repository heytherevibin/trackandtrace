import { NextResponse } from "next/server";
import { assertConsoleAvailable } from "@/console/availability";
import { createConsoleDb, createConsoleServiceDb } from "@/console/auth/db";
import { parseAuthMember, sessionIdFromClaims } from "@/console/auth/member";
import { nextAfterConfirm, startConsoleSession } from "@/console/auth/session";
import { consoleHref } from "@/console/href";
import { log } from "@/services/log";
import { clientIp } from "@/services/rate-limit";

export const dynamic = "force-dynamic";

function to(req: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, new URL(req.url).origin), 303);
}

/**
 * Step 2 of spec §C: the link is verified here, on the server, and a console session row is opened
 * under the access token's own `session_id` claim -- the very id `console.current_member()` reads
 * back out of `request.jwt.claims`. The session is not key-verified yet, so it opens nothing but
 * the next step: Setup while the member holds fewer than two keys, the key step otherwise.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const signIn = consoleHref("/login?error=link");
  try {
    assertConsoleAvailable();
    const params = new URL(req.url).searchParams;
    const tokenHash = params.get("token_hash");
    if (!tokenHash || params.get("type") !== "magiclink") return to(req, signIn);

    const db = await createConsoleDb();
    const verified = await db.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    if (verified.error) return to(req, signIn);

    // verifyOtp has already written a session cookie via @supabase/ssr: every exit from here on --
    // an early return below, or anything the block throws -- must sign that cookie back out unless
    // confirmation actually completes, so a failed confirmation never leaves the browser holding a
    // cookie sign-in just called a failure. One `finally`, so a branch added here later can't forget
    // it the way the claims check once did.
    let confirmed = false;
    try {
      const claims = await db.auth.getClaims();
      const sessionId = sessionIdFromClaims(claims.data?.claims);
      const userId = (claims.data?.claims as { sub?: unknown } | undefined)?.sub;
      const address = verified.data?.user?.email;
      if (!sessionId || typeof userId !== "string" || !address) return to(req, signIn);

      // A link can only have been minted for a member, but the address is re-checked here because
      // this is the last point before a console session exists: an account that stopped being a
      // member between the mint and the click must not get one. Parsed, not cast, so a drifted
      // field name fails closed instead of silently no longer excluding a removed member.
      const service = createConsoleServiceDb();
      const { data } = await service.rpc("console_auth_member_by_email", { p_email: address.toLowerCase() });
      const member = parseAuthMember(data);
      if (!member || member.userId !== userId || member.status === "removed") return to(req, signIn);

      await startConsoleSession({
        sessionId,
        member: userId,
        userAgent: req.headers.get("user-agent"),
        ip: clientIp(null, req.headers.get("x-forwarded-for")),
        db: service,
      });

      confirmed = true;
      return to(req, consoleHref(nextAfterConfirm(member.keyCount)));
    } finally {
      if (!confirmed) await db.auth.signOut();
    }
  } catch (err) {
    log.warn("[console] a sign-in link could not be confirmed", err);
    return to(req, signIn);
  }
}
