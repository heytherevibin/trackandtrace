import { createHash } from "node:crypto";
import { z } from "zod";
import { createConsoleDb, createConsoleServiceDb, type ConsoleDb } from "@/console/auth/db";
import { sessionIdFromClaims, type ConsoleRole } from "@/console/auth/member";
import { consoleEnvironment, startConsoleSession } from "@/console/auth/session";
import { sendSignInLink } from "@/console/auth/sign-in-link";
import { consoleOrigin } from "@/console/hosts";
import { consoleMessages } from "@/console/messages";
import { env } from "@/services/env";
import { AppError } from "@/services/errors";
import { log } from "@/services/log";
import { clientIp } from "@/services/rate-limit";

const s = consoleMessages.session;

/**
 * `console.create_first_owner_link` stores `digest(token, 'sha256')`, and PostgREST takes a bytea
 * argument as a `\x…` hex literal. This is that shape. `console.invites` stores a token the same
 * way (`console_invite_member`: `extensions.digest(v_token, 'sha256')`), so this hashes both kinds
 * -- reused by `lookupInviteToken` below rather than a second hasher.
 */
export function setupTokenHash(token: string): string {
  return `\\x${createHash("sha256").update(token).digest("hex")}`;
}

/**
 * The first Owner's name, and an invited member's starting name alike (Task 2d's Team can rename
 * either afterwards): the local part, separators to spaces, each word capitalised. Neither drawn
 * arrival asks for a name.
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

// console_auth_invite (Task 2b, 20260922100000_console_auth_invite.sql) is the read; only
// console_auth_accept_invite may ever spend one. Both flags can be true on the same row (an Owner
// can revoke an invite that has already expired), so the caller below decides which one wins.
const inviteReadShape = z
  .object({
    email: z.string().min(3).max(254),
    role: z.enum(["owner", "admin", "support", "viewer"]),
    expired: z.boolean(),
    withdrawn: z.boolean(),
  })
  .nullable();

function isAlreadyRegistered(error: { readonly code?: string; readonly message: string }): boolean {
  return error.code === "email_exists" || /already\s*(been\s*)?registered/i.test(error.message);
}

/** A technical failure, not a refusal: apiRequest's caller maps this to consoleMessages.session.unavailable. */
function unavailable(): AppError {
  return new AppError("SOURCE_UNAVAILABLE", s.unavailable, { status: 503 });
}

/**
 * Best effort: a failed sign-out must never mask the real refusal it follows, but it is logged.
 * scope: "local" -- see the comment at src/app/console/api/sign-out/route.ts. This undoes the
 * session verifyOtp just created a moment ago in this same call, which is local by definition.
 */
async function bestEffortSignOut(db: ConsoleDb): Promise<void> {
  try {
    await db.auth.signOut({ scope: "local" });
  } catch (err) {
    log.warn("[console] could not sign out an unredeemed setup session", err);
  }
}

/**
 * What a raw token turns out to be (Task 2b), read before any session exists and before anything
 * is spent. `console_auth_invite` is asked first, because it is the only side with two refusals to
 * tell apart; everything else -- a live first-Owner link, a spent one, or a token nobody ever
 * issued -- reads as "owner" here, because `redeemSetupToken`'s existing server-to-server attempt
 * already answers all three of those alike (decision #1 above). Which table a token belongs to is
 * this lookup, never a guess from its shape: both kinds are the same 64 hex characters.
 */
export type InviteTokenLookup =
  | { readonly kind: "invite"; readonly state: "live"; readonly email: string; readonly role: ConsoleRole }
  | { readonly kind: "invite"; readonly state: "expired" | "withdrawn" }
  | { readonly kind: "owner" };

export async function lookupInviteToken(token: string, db?: ConsoleDb): Promise<InviteTokenLookup> {
  const service = db ?? createConsoleServiceDb();
  const read = await service.rpc("console_auth_invite", { p_token_hash: setupTokenHash(token) });
  const parsed = inviteReadShape.safeParse(read.data);
  if (read.error || !parsed.success || parsed.data === null) return { kind: "owner" };
  const { email, role, expired, withdrawn } = parsed.data;
  // Withdrawn wins when a row is somehow both: an Owner revoking a stale invite is a deliberate
  // act, so it is the more specific answer, and either one is a strictly safe refusal in place of
  // the live path below.
  if (withdrawn) return { kind: "invite", state: "withdrawn" };
  if (expired) return { kind: "invite", state: "expired" };
  return { kind: "invite", state: "live", email, role };
}

/**
 * Accepting a live invite (Task 2b): create-or-find the auth.users row at the invited address --
 * never trusted from a caller, only from `lookupInviteToken`'s own read a moment ago -- spend the
 * invite, then mail a sign-in link. No session is opened on this browser: unlike the first-Owner
 * flow below, the device that accepts and the device that signs in are allowed to differ (the
 * member "receives a sign-in link, and opens it on the device they'll set up").
 */
async function acceptInvite(args: {
  readonly email: string;
  readonly tokenHashArg: string;
  readonly req: Request;
  readonly service: ConsoleDb;
}): Promise<{ readonly ok: true; readonly kind: "invite" } | { readonly ok: false; readonly reason: "expired" }> {
  const { email, tokenHashArg, req, service } = args;

  // The address may already have an auth.users account (e.g. this member's own traveller
  // sign-in): ignore only that one error, the same rule the first-Owner flow below already uses.
  const created = await service.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && !isAlreadyRegistered(created.error)) throw unavailable();

  // generateLink hands back the auth.users row for this address, new or pre-existing, which is the
  // only reason it runs here: console_auth_accept_invite needs a real id to check against the
  // invite's own email. Its token is discarded -- verifyOtp is never called, so no cookie is ever
  // written here -- and sendSignInLink mints the one that actually gets mailed, below.
  const minted = await service.auth.admin.generateLink({ type: "magiclink", email });
  const userId = minted.data?.user?.id;
  if (minted.error || !userId) throw unavailable();

  const accepted = await service.rpc("console_auth_accept_invite", {
    p_token_hash: tokenHashArg,
    p_user: userId,
    p_name: nameFromAddress(email),
    p_environment: consoleEnvironment(),
  });
  const parsedAccept = redemptionShape.safeParse(accepted.data);
  // A race, not the ordinary case: the invite was live a moment ago (lookupInviteToken's own
  // read), and closed -- accepted, expired or revoked -- before this call reached it. The sheet
  // has no third refusal for that window, so it answers the same as a plain expired one.
  if (accepted.error || !parsedAccept.success || parsedAccept.data === null) return { ok: false, reason: "expired" };

  const origin = consoleOrigin(req.headers.get("host"), env().VERCEL_ENV);
  await sendSignInLink(email, origin, service);
  return { ok: true, kind: "invite" };
}

/**
 * Redeems a setup token, of either kind (Task 2b). An invite is read first (`lookupInviteToken`):
 * live, it is accepted and a sign-in link goes out; closed, its own refusal comes straight back,
 * without ever calling createUser or touching auth.
 *
 * Anything else -- a first-Owner link, a spent one, or a token nobody issued -- falls through to
 * the original server-to-server redemption below, unchanged: no email at all, because whoever
 * holds that link came from the SQL editor. Read-check-then-spend, in that order (decision #2):
 * resolve the link, create/sign in the account, read the claims, then redeem. A null from either
 * RPC -- no live link, or the console already has an Owner -- refuses the same way. Once `verifyOtp`
 * has written a cookie, every exit from here on signs it back out, exactly as the confirm route's
 * post-verifyOtp try/finally does.
 */
export type RedeemOutcome =
  | { readonly ok: true; readonly kind: "owner" | "invite" }
  | { readonly ok: false; readonly reason: "expired" | "withdrawn" };

export async function redeemSetupToken(args: { readonly token: string; readonly req: Request }): Promise<RedeemOutcome> {
  const service = createConsoleServiceDb();
  const tokenHashArg = setupTokenHash(args.token);

  const entry = await lookupInviteToken(args.token, service);
  if (entry.kind === "invite") {
    if (entry.state !== "live") return { ok: false, reason: entry.state };
    return acceptInvite({ email: entry.email, tokenHashArg, req: args.req, service });
  }

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
    if (!sessionId || typeof sub !== "string") {
      // Told to the member as "expired" (the signature this function returns has no other
      // reason), but a freshly-verified magic link should always carry both claims -- this is a
      // technical anomaly, not a spent link, so the real cause is not left silent.
      log.warn("[console] a verified setup session had no session_id or sub in its claims");
      return { ok: false, reason: "expired" };
    }

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
    return { ok: true, kind: "owner" };
  } finally {
    if (!redeemed) await bestEffortSignOut(db);
  }
}
