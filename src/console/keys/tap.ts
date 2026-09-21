import { z } from "zod";
import { createConsoleDb, createConsoleServiceDb, type ConsoleDb } from "@/console/auth/db";
import { writeConsoleAudit } from "@/console/auth/audit";
import { requireConsoleMember } from "@/console/auth/guard";
import { sessionIdFromClaims, type ConsoleMember } from "@/console/auth/member";
import { consoleAddressHash, deviceLabel } from "@/console/auth/session";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { log } from "@/services/log";
import { clientIp } from "@/services/rate-limit";
import { base64ToBase64url } from "./encoding";
import { relyingParty } from "./rp";
import { authenticationOptionsFor, verifyAuthentication, type StoredKey } from "./webauthn";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

const m = consoleMessages.keys;

/**
 * The four fields a tap approves, exactly as the dialog collects them and exactly as
 * `console.action_digest` hashes them (spec §D step 2). The server never computes a digest -- see
 * `console_auth_new_action_challenge`, the migration this module calls into -- so these pass
 * through to the database verbatim, never reshaped or re-ordered.
 */
export interface TapRequest {
  readonly action: string;
  readonly target: string;
  readonly value: string;
  readonly reason: string;
}

/**
 * The reason, validated once. `.trim()` is a transform, so this schema decides
 * the exact string that gets digested -- and the later action that spends the
 * tap must digest the very same one. Every route that carries a reason into a
 * tap imports this; a second schema that merely looks the same would make a
 * reason with a trailing space mint one digest and spend against another, and
 * every such action would fail with "no tap for this action" and nothing would
 * say why.
 */
export const tapReason = z.string().trim().min(10, consoleMessages.tap.reasonShort).max(200);

interface Deps {
  readonly db?: ConsoleDb;
  readonly service?: ConsoleDb;
}

function ended(): AppError {
  return new AppError("UNAUTHENTICATED", consoleMessages.session.ended, { status: 401 });
}

/** The session claim behind an already-verified member -- requireConsoleMember has just proven it live. */
async function currentSessionId(db: ConsoleDb): Promise<string> {
  const claims = await db.auth.getClaims();
  const sessionId = sessionIdFromClaims(claims.data?.claims);
  if (!sessionId) throw ended();
  return sessionId;
}

const keyRowShape = z.object({
  id: z.guid(),
  credential_id: z.string().min(1),
  public_key: z.string().min(1),
  counter: z.number().int().nonnegative(),
  transports: z.array(z.string()),
});

/**
 * The member's keys, every binary field turned from the database's base64 into base64url. Mirrors
 * ceremony.ts's own `keysFor`: parsed, not cast, so a row that fails to parse fails closed instead
 * of reading as "no keys".
 */
async function keysFor(service: ConsoleDb, memberId: string): Promise<readonly StoredKey[]> {
  const { data, error } = await service.rpc("console_auth_keys_for_member", { p_member: memberId });
  if (error) throw ended();
  const parsed = z.array(keyRowShape).safeParse(data);
  if (!parsed.success) throw ended();
  return parsed.data.map((row) => ({
    id: row.id,
    credentialId: base64ToBase64url(row.credential_id),
    publicKey: base64ToBase64url(row.public_key),
    counter: row.counter,
    transports: row.transports,
  }));
}

/** The challenge the browser signed, as it appears in the response's own clientDataJSON. */
function challengeFrom(response: { readonly response?: { readonly clientDataJSON?: string } }): string {
  const raw = response.response?.clientDataJSON;
  if (!raw) throw new AppError("INVALID_INPUT", m.didNotAnswer, { status: 400 });
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const value = (parsed as { challenge?: unknown }).challenge;
    if (typeof value !== "string" || value.length === 0) throw new Error("no challenge");
    return value;
  } catch {
    throw new AppError("INVALID_INPUT", m.didNotAnswer, { status: 400 });
  }
}

/** Finds the stored key the browser says it used, or refuses in the sheet's own words. */
function keyFor(keys: readonly StoredKey[], credentialId: string): StoredKey {
  const key = keys.find((candidate) => candidate.credentialId === credentialId);
  if (!key) throw new AppError("INVALID_INPUT", m.notYours, { status: 400 });
  return key;
}

const readChallengeRowShape = z.object({ session_id: z.guid() });

/**
 * Reads, and only reads, the action challenge the dialog is answering. `console_auth_take_challenge`
 * is deliberately never called here: the tap is spent later, inside the database, by
 * `console.use_tap()` when the action itself runs, and spending it here would leave nothing for
 * that function to find.
 */
async function readChallenge(service: ConsoleDb, memberId: string, sessionId: string, challenge: string): Promise<void> {
  const { data, error } = await service.rpc("console_auth_read_challenge", {
    p_challenge: challenge,
    p_member: memberId,
    p_purpose: "action",
  });
  if (error) throw ended();
  // No row at all covers "never existed", "wrong member or purpose", "already spent" and "past its
  // five-minute window" alike -- console_auth_read_challenge can't tell them apart, and none of them
  // is the member's session having gone bad, so this reads as "try again" (spec §5), not a
  // sign-out. A row that exists but names a different session is the one case that is -- the same
  // reasoning ceremony.ts's spend() uses for console_auth_take_challenge.
  if (data === null) throw new AppError("INVALID_INPUT", m.didNotAnswer, { status: 400 });
  const parsed = readChallengeRowShape.safeParse(data);
  if (!parsed.success || parsed.data.session_id !== sessionId) throw ended();
}

async function logFailedTap(service: ConsoleDb, member: ConsoleMember, req: Request): Promise<void> {
  await writeConsoleAudit(service, {
    actor: member.userId,
    actorName: member.name,
    actorRole: member.role,
    sessionLabel: deviceLabel(req.headers.get("user-agent")),
    category: "session",
    action: "Key tap failed",
    target: "Console",
    result: "failed",
    addressHash: consoleAddressHash(clientIp(null, req.headers.get("x-forwarded-for"))),
  });
}

/**
 * Mints the challenge a per-action tap is bound to (spec §D step 2). The four fields go to the
 * database exactly as the dialog collected them -- never a digest computed here -- so
 * `console.action_digest`'s per-field hashing has only one implementation to ever agree with.
 */
export async function beginTap(args: { readonly req: Request; readonly tap: TapRequest } & Deps): Promise<{ readonly options: unknown }> {
  const db = args.db ?? (await createConsoleDb());
  const service = args.service ?? createConsoleServiceDb();
  const member = await requireConsoleMember(undefined, db);
  const sessionId = await currentSessionId(db);
  const rp = relyingParty(args.req.headers.get("host"));
  const keys = await keysFor(service, member.userId);
  const options = await authenticationOptionsFor({ rp, allow: keys });

  const { error } = await service.rpc("console_auth_new_action_challenge", {
    p_member: member.userId,
    p_session: sessionId,
    p_challenge: options.challenge,
    p_action: args.tap.action,
    p_target: args.tap.target,
    p_value: args.tap.value,
    p_reason: args.tap.reason,
  });
  if (error) throw ended();

  return { options };
}

/**
 * Verifies the tap's assertion and touches the key -- and, unlike every other ceremony in this
 * console, spends nothing. The action the tap approves spends it, inside the database, by calling
 * `console.use_tap()` with the very same four fields; this function's whole job is proving a real
 * key answered, not deciding the tap is used up.
 */
export async function verifyTap(args: { readonly req: Request; readonly response: AuthenticationResponseJSON } & Deps): Promise<void> {
  const db = args.db ?? (await createConsoleDb());
  const service = args.service ?? createConsoleServiceDb();
  const member = await requireConsoleMember(undefined, db);
  const sessionId = await currentSessionId(db);
  const rp = relyingParty(args.req.headers.get("host"));
  const keys = await keysFor(service, member.userId);

  // Everything that can fail while the credential is being read and verified logs a failed tap --
  // "That key didn't answer" (a garbled clientDataJSON or a dead challenge), "isn't one of yours"
  // (keyFor) and a bad signature (verifyAuthentication) are all the same event from the member's
  // side, and spec §5's failure table lists all three together.
  try {
    const challenge = challengeFrom(args.response);
    await readChallenge(service, member.userId, sessionId, challenge);
    const key = keyFor(keys, args.response.id);
    const verified = await verifyAuthentication({ rp, response: args.response, expectedChallenge: challenge, key });
    const { error: touchError } = await service.rpc("console_auth_touch_key", { p_key: key.id, p_counter: verified.newCounter });
    if (touchError) log.warn("[console] a key's counter could not be updated", { keyId: key.id, message: touchError.message });
  } catch (err) {
    await logFailedTap(service, member, args.req);
    throw err;
  }
}
