import { createHash } from "node:crypto";
import { z } from "zod";
import { createConsoleDb, createConsoleServiceDb, type ConsoleDb } from "@/console/auth/db";
import { sessionIdFromClaims } from "@/console/auth/member";
import { consoleEnvironment, startConsoleSession } from "@/console/auth/session";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { clientIp } from "@/services/rate-limit";

const s = consoleMessages.session;

/**
 * `console.create_first_owner_link` stores `digest(token, 'sha256')`, and PostgREST takes a bytea
 * argument as a `\x…` hex literal. This is that shape.
 */
export function setupTokenHash(token: string): string {
  return `\\x${createHash("sha256").update(token).digest("hex")}`;
}

/**
 * The first Owner's name. `create_first_owner_link` takes only an address and no drawn field asks
 * for a name, so it is derived: the local part, separators to spaces, each word capitalised. Team
 * (2d) can rename them afterwards.
 */
export function nameFromAddress(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .split(/[._-]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return (words.length > 0 ? words.join(" ") : "Owner").slice(0, 120);
}

// Parsed, not cast (decision #1): a field-name drift on either RPC must fail closed -- read as "no
// live link" / "not redeemed" -- rather than hand a caller a value it treats as real.
const setupLinkShape = z.object({ email: z.string().min(3).max(254) }).nullable();
const redemptionShape = z.object({ user_id: z.guid() }).nullable();

function isAlreadyRegistered(error: { readonly code?: string; readonly message: string }): boolean {
  return error.code === "email_exists" || /already\s*(been\s*)?registered/i.test(error.message);
}

/** A technical failure, not a refusal: apiRequest's caller maps this to consoleMessages.session.unavailable. */
function unavailable(): AppError {
  return new AppError("SOURCE_UNAVAILABLE", s.unavailable, { status: 503 });
}

/** Best effort: a failed sign-out must never mask the real refusal it follows. */
async function bestEffortSignOut(db: ConsoleDb): Promise<void> {
  try {
    await db.auth.signOut();
  } catch {
    // Nothing to do here: the caller is already refusing.
  }
}

/**
 * Redeems a first-Owner setup link server to server -- no email at all. The one-time link out of
 * the Supabase SQL editor is the whole credential: opening it proves possession, so the address
 * comes off the live link row, a magic link is minted and immediately verified for it, and only
 * then is the link spent.
 *
 * Read-check-then-spend, in that order (decision #2): resolve the link, create/sign in the
 * account, read the claims, then redeem. A null from either RPC -- no live link, or the console
 * already has an Owner -- refuses the same way. Once `verifyOtp` has written a cookie, every exit
 * from here on signs it back out, exactly as the confirm route's post-verifyOtp try/finally does.
 */
export async function redeemSetupToken(args: {
  readonly token: string;
  readonly req: Request;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: "expired" }> {
  const service = createConsoleServiceDb();
  const tokenHashArg = setupTokenHash(args.token);

  const linkLookup = await service.rpc("console_auth_setup_link", { p_token_hash: tokenHashArg });
  const parsedLink = setupLinkShape.safeParse(linkLookup.data);
  if (linkLookup.error || !parsedLink.success || parsedLink.data === null) return { ok: false, reason: "expired" };
  const email = parsedLink.data.email;

  // The address may already have an auth.users account (e.g. the owner's own traveller sign-in):
  // ignore only that one error and let generateLink mint a link for the existing account.
  const created = await service.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && !isAlreadyRegistered(created.error)) throw unavailable();

  const minted = await service.auth.admin.generateLink({ type: "magiclink", email });
  const hashedToken = minted.data?.properties?.hashed_token;
  if (minted.error || !hashedToken) throw unavailable();

  const db = await createConsoleDb();
  const verified = await db.auth.verifyOtp({ type: "magiclink", token_hash: hashedToken });
  if (verified.error) throw unavailable();

  // verifyOtp has just written a session cookie via @supabase/ssr: every exit from here on --
  // an early return, or anything this throws -- must sign that cookie back out unless redemption
  // actually completes.
  let redeemed = false;
  try {
    const claims = await db.auth.getClaims();
    const sessionId = sessionIdFromClaims(claims.data?.claims);
    const sub = (claims.data?.claims as { sub?: unknown } | undefined)?.sub;
    if (!sessionId || typeof sub !== "string") return { ok: false, reason: "expired" };

    const redemption = await service.rpc("console_auth_redeem_setup_link", {
      p_token_hash: tokenHashArg,
      p_user: sub,
      p_email: email,
      p_name: nameFromAddress(email),
      p_environment: consoleEnvironment(),
    });
    const parsedRedemption = redemptionShape.safeParse(redemption.data);
    if (redemption.error || !parsedRedemption.success || parsedRedemption.data === null) return { ok: false, reason: "expired" };

    await startConsoleSession({
      sessionId,
      member: sub,
      userAgent: args.req.headers.get("user-agent"),
      ip: clientIp(null, args.req.headers.get("x-forwarded-for")),
      db: service,
    });
    redeemed = true;
    return { ok: true };
  } finally {
    if (!redeemed) await bestEffortSignOut(db);
  }
}
