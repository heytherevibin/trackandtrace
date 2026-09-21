import { z } from "zod";
import { createConsoleDb, createConsoleServiceDb, type ConsoleDb } from "@/console/auth/db";
import { writeConsoleAudit } from "@/console/auth/audit";
import { parseLinkSession, sessionIdFromClaims, type LinkSession } from "@/console/auth/member";
import { consoleAddressHash, deviceLabel } from "@/console/auth/session";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { log } from "@/services/log";
import { clientIp } from "@/services/rate-limit";
import { base64ToBase64url, base64urlToByteaLiteral } from "./encoding";
import { relyingParty } from "./rp";
import {
  authenticationOptionsFor,
  registrationOptionsFor,
  verifyAuthentication,
  verifyRegistration,
  type ConsoleKeyType,
  type StoredKey,
} from "./webauthn";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

export type { LinkSession };

const m = consoleMessages.keys;
const s = consoleMessages.session;

interface Deps {
  readonly db?: ConsoleDb;
  readonly service?: ConsoleDb;
}

function ended(): AppError {
  return new AppError("UNAUTHENTICATED", s.ended, { status: 401 });
}

/**
 * The gate for the key step itself. `requireConsoleMember()` cannot be used here: it demands a
 * key-verified session, which is precisely what these endpoints exist to produce. This asks the
 * database for the session the link opened -- live, unrevoked, not idle past a day, and belonging
 * to a member who has not been removed -- and nothing more.
 */
export async function requireLinkSession(deps: Deps = {}): Promise<LinkSession> {
  const db = deps.db ?? (await createConsoleDb());
  const service = deps.service ?? createConsoleServiceDb();
  const claims = await db.auth.getClaims();
  const sessionId = sessionIdFromClaims(claims.data?.claims);
  if (!sessionId) throw ended();

  const { data, error } = await service.rpc("console_auth_session", { p_session_id: sessionId });
  if (error) throw ended();
  const session = parseLinkSession(data);
  if (!session) throw ended();
  return session;
}

const keyRowShape = z.object({
  id: z.guid(),
  credential_id: z.string().min(1),
  public_key: z.string().min(1),
  counter: z.number().int().nonnegative(),
  transports: z.array(z.string()),
});

/**
 * The member's keys, every binary field turned from the database's base64 into base64url. Parsed,
 * not cast: a row that fails to parse must not read as "no keys" -- an empty list here would let a
 * member who already holds a key register another with no tap, or open a sign-in ceremony as though
 * this were their first key, so a parse failure throws the same as any other broken read.
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

type Purpose = "sign_in" | "add_key" | "add_key_tap";

async function mint(service: ConsoleDb, session: LinkSession, purpose: Purpose, challenge: string): Promise<void> {
  const { error } = await service.rpc("console_auth_new_challenge", {
    p_member: session.memberId,
    p_session: session.sessionId,
    p_purpose: purpose,
    p_challenge: challenge,
    p_digest: null as never,
  });
  if (error) throw ended();
}

const spentChallengeShape = z.object({ session_id: z.guid() });

/**
 * Spends the challenge and checks it was this session's. `console_auth_take_challenge` matches on
 * member and purpose but not on session, so a member's second browser tab could otherwise finish a
 * ceremony the first one started.
 */
async function spend(service: ConsoleDb, session: LinkSession, purpose: Purpose, challenge: string): Promise<void> {
  const { data, error } = await service.rpc("console_auth_take_challenge", {
    p_challenge: challenge,
    p_member: session.memberId,
    p_purpose: purpose,
  });
  if (error) throw ended();
  // No row at all covers "never existed", "wrong member or purpose", "already spent" and "past its
  // five-minute window" alike -- console_auth_take_challenge can't tell them apart, and none of
  // them is the member's session having gone bad, so this reads as "try again" (spec §5), not a
  // sign-out. A row that exists but names a different session is the one case that is.
  if (data === null) throw new AppError("INVALID_INPUT", m.didNotAnswer, { status: 400 });
  const parsed = spentChallengeShape.safeParse(data);
  if (!parsed.success || parsed.data.session_id !== session.sessionId) throw ended();
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

export async function beginCeremony(args: { readonly intent: "sign_in" | "add_key"; readonly req: Request } & Deps): Promise<{
  readonly step: "tap" | "register";
  readonly options: unknown;
}> {
  const service = args.service ?? createConsoleServiceDb();
  const session = await requireLinkSession({ db: args.db, service });
  const rp = relyingParty(args.req.headers.get("host"));
  const keys = await keysFor(service, session.memberId);

  if (args.intent === "sign_in") {
    if (keys.length === 0) throw new AppError("INVALID_INPUT", m.noKeysYet, { status: 400 });
    const options = await authenticationOptionsFor({ rp, allow: keys });
    await mint(service, session, "sign_in", options.challenge);
    return { step: "tap", options };
  }

  // Spec §D: setup's first key needs only the link session; every later key starts with a tap.
  if (keys.length > 0) {
    const options = await authenticationOptionsFor({ rp, allow: keys });
    await mint(service, session, "add_key_tap", options.challenge);
    return { step: "tap", options };
  }
  const options = await registrationOptionsFor({
    rp,
    member: { userId: session.memberId, email: session.email, name: session.name },
    existing: keys,
  });
  await mint(service, session, "add_key", options.challenge);
  return { step: "register", options };
}

async function logFailedTap(service: ConsoleDb, session: LinkSession, req: Request): Promise<void> {
  await writeConsoleAudit(service, {
    actor: session.memberId,
    actorName: session.name,
    actorRole: session.role,
    sessionLabel: deviceLabel(req.headers.get("user-agent")),
    category: "session",
    action: "Key tap failed",
    target: "Console",
    result: "failed",
    addressHash: consoleAddressHash(clientIp(null, req.headers.get("x-forwarded-for"))),
  });
}

/** Finds the stored key the browser says it used, or refuses in the sheet's own words. */
function keyFor(keys: readonly StoredKey[], credentialId: string): StoredKey {
  const key = keys.find((candidate) => candidate.credentialId === credentialId);
  if (!key) throw new AppError("INVALID_INPUT", m.notYours, { status: 400 });
  return key;
}

export async function completeSignIn(args: { readonly req: Request; readonly response: AuthenticationResponseJSON } & Deps): Promise<void> {
  const service = args.service ?? createConsoleServiceDb();
  const session = await requireLinkSession({ db: args.db, service });
  const rp = relyingParty(args.req.headers.get("host"));
  const keys = await keysFor(service, session.memberId);

  // Everything that can fail while the credential is being read and verified logs a failed tap --
  // "That key didn't answer" (a garbled clientDataJSON), "isn't one of yours" (keyFor) and a bad
  // signature (verifyAuthentication) are all the same event from the member's side, and spec §5's
  // failure table lists all three together.
  let key: StoredKey;
  let verified: Awaited<ReturnType<typeof verifyAuthentication>>;
  try {
    const challenge = challengeFrom(args.response);
    await spend(service, session, "sign_in", challenge);
    key = keyFor(keys, args.response.id);
    verified = await verifyAuthentication({ rp, response: args.response, expectedChallenge: challenge, key });
  } catch (err) {
    await logFailedTap(service, session, args.req);
    throw err;
  }

  const { error: touchError } = await service.rpc("console_auth_touch_key", { p_key: key.id, p_counter: verified.newCounter });
  if (touchError) log.warn("[console] a key's counter could not be updated", { keyId: key.id, message: touchError.message });

  const { error } = await service.rpc("console_auth_verify_session", { p_session_id: session.sessionId, p_key_id: key.id });
  if (error) throw ended();

  await writeConsoleAudit(service, {
    actor: session.memberId,
    actorName: session.name,
    actorRole: session.role,
    keyId: key.id,
    sessionLabel: deviceLabel(args.req.headers.get("user-agent")),
    category: "session",
    action: "Signed in",
    target: "Console",
    result: "done",
    addressHash: consoleAddressHash(clientIp(null, args.req.headers.get("x-forwarded-for"))),
  });
}

/** The tap that unlocks adding another key: it spends an `add_key_tap` and mints an `add_key`. */
export async function completeTap(args: { readonly req: Request; readonly response: AuthenticationResponseJSON } & Deps): Promise<{ readonly options: unknown }> {
  const service = args.service ?? createConsoleServiceDb();
  const session = await requireLinkSession({ db: args.db, service });
  const rp = relyingParty(args.req.headers.get("host"));
  const keys = await keysFor(service, session.memberId);

  try {
    const challenge = challengeFrom(args.response);
    await spend(service, session, "add_key_tap", challenge);
    const key = keyFor(keys, args.response.id);
    const verified = await verifyAuthentication({ rp, response: args.response, expectedChallenge: challenge, key });
    const { error: touchError } = await service.rpc("console_auth_touch_key", { p_key: key.id, p_counter: verified.newCounter });
    if (touchError) log.warn("[console] a key's counter could not be updated", { keyId: key.id, message: touchError.message });
  } catch (err) {
    await logFailedTap(service, session, args.req);
    throw err;
  }

  const options = await registrationOptionsFor({
    rp,
    member: { userId: session.memberId, email: session.email, name: session.name },
    existing: keys,
  });
  await mint(service, session, "add_key", options.challenge);
  return { options };
}

export async function completeRegistration(
  args: {
    readonly req: Request;
    readonly response: RegistrationResponseJSON;
    readonly name: string;
    /** Test seam: the already-verified attestation. Production callers leave it out. */
    readonly verified?: {
      readonly credentialId: string;
      readonly publicKey: string;
      readonly counter: number;
      readonly transports: readonly string[];
      readonly keyType: ConsoleKeyType;
    };
  } & Deps,
): Promise<{ readonly keyCount: number; readonly activated: boolean }> {
  const service = args.service ?? createConsoleServiceDb();
  const session = await requireLinkSession({ db: args.db, service });
  const rp = relyingParty(args.req.headers.get("host"));
  const challenge = challengeFrom(args.response);

  await spend(service, session, "add_key", challenge);
  const verified = args.verified ?? (await verifyRegistration({ rp, response: args.response, expectedChallenge: challenge }));

  const recorded = await service.rpc("console_auth_record_key", {
    p_member: session.memberId,
    p_credential_id: base64urlToByteaLiteral(verified.credentialId),
    p_public_key: base64urlToByteaLiteral(verified.publicKey),
    p_counter: verified.counter,
    p_transports: [...verified.transports],
    p_name: args.name,
    p_type: verified.keyType,
  });
  if (recorded.error) {
    // The unique index on credential_id is the real enforcement of "the same key twice is refused";
    // excludeCredentials only asks the browser nicely.
    if (recorded.error.message.includes("console_keys_credential_key")) {
      throw new AppError("INVALID_INPUT", m.alreadyAdded, { status: 409 });
    }
    throw ended();
  }
  // A successful insert always returns the new row's id. Guarding it (rather than coercing with
  // String(...)) matters because String(null) is the four-character string "null" -- an
  // unexpected null here must not silently become a key id that names no real key, reaching
  // console_auth_verify_session and the audit row as if it did.
  const keyId = recorded.data;
  if (typeof keyId !== "string" || keyId.length === 0) throw ended();
  const keyCount = session.keyCount + 1;

  const activation = await service.rpc("console_auth_activate_member", { p_member: session.memberId });
  // console_auth_activate_member "reports the state, not whether this call is what produced it"
  // (its own SQL comment): an already-active member adding a spare key also gets `data: true`.
  // What the route and the session-verify step below actually need is whether THIS call is what
  // crossed setup -> active, derived from the status the pre-guard already read.
  const wasActive = session.status === "active";
  const justActivated = !wasActive && activation.data === true;

  // Registration requires a touch, so the new key has just been used: key-verifying the session
  // here is what lets "You're set up" lead straight to the console, with no extra tap. An
  // already-active member adding a spare key does not get this side effect -- their session's
  // key-verification is a sign-in concern, not a byproduct of key management.
  if (justActivated && !session.keyVerified) {
    const { error } = await service.rpc("console_auth_verify_session", { p_session_id: session.sessionId, p_key_id: keyId });
    if (error) throw ended();
  }

  await writeConsoleAudit(service, {
    actor: session.memberId,
    actorName: session.name,
    actorRole: session.role,
    keyId,
    sessionLabel: deviceLabel(args.req.headers.get("user-agent")),
    category: "session",
    action: "Added a key",
    target: args.name,
    result: "done",
    addressHash: consoleAddressHash(clientIp(null, args.req.headers.get("x-forwarded-for"))),
    after: { type: verified.keyType },
  });

  return { keyCount, activated: justActivated };
}
