import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleDb } from "@/console/auth/db";
import { beginCeremony, completeRegistration, completeSignIn, requireLinkSession } from "@/console/keys/ceremony";

const RP = { id: "admin.localhost", origin: "http://admin.localhost:4210", name: "Trakline Console" };
const SESSION = {
  session_id: "22222222-2222-2222-2222-222222222222",
  member_id: "11111111-1111-1111-1111-111111111111",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "setup",
  key_verified: false,
  key_count: 0,
};
const KEY_ROW = { id: "33333333-3333-3333-3333-333333333333", credential_id: "Y3JlZA==", public_key: "cHVia2V5", counter: 3, transports: ["usb"] };

/**
 * A ceremony response carrying just enough of the real WebAuthn shape for `challengeFrom` to read a
 * challenge back out of `clientDataJSON` -- every completeSignIn/completeTap/completeRegistration
 * test needs this, even the ones whose fake RPC ignores the challenge's actual value, because
 * `challengeFrom` runs before any of them and a bare `{id}` throws "didn't answer" first.
 */
function responseWithChallenge(id: string, challenge = "c"): { id: string; response: { clientDataJSON: string } } {
  return { id, response: { clientDataJSON: Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: RP.origin })).toString("base64url") } };
}

function fakes(overrides: Record<string, unknown> = {}) {
  const answers: Record<string, unknown> = {
    console_auth_session: SESSION,
    console_auth_keys_for_member: [],
    console_auth_new_challenge: "44444444-4444-4444-4444-444444444444",
    console_auth_take_challenge: null,
    console_auth_record_key: "55555555-5555-5555-5555-555555555555",
    console_auth_activate_member: false,
    console_auth_touch_key: null,
    console_auth_verify_session: null,
    console_auth_write_audit: "66666666-6666-6666-6666-666666666666",
    ...overrides,
  };
  const rpc = vi.fn((name: string) => Promise.resolve({ data: answers[name] ?? null, error: null }));
  const service = { rpc } as unknown as ConsoleDb;
  const member = {
    auth: { getClaims: () => Promise.resolve({ data: { claims: { sub: SESSION.member_id, session_id: SESSION.session_id } }, error: null }) },
  } as unknown as ConsoleDb;
  return { service, member, rpc };
}

const REQUEST = new Request("http://admin.localhost:4210/console/api/keys/options", { headers: { host: "admin.localhost:4210" } });

beforeEach(() => vi.clearAllMocks());

describe("requireLinkSession", () => {
  it("reads the session the link opened, key-verified or not", async () => {
    const { service, member } = fakes();
    await expect(requireLinkSession({ db: member, service })).resolves.toMatchObject({ memberId: SESSION.member_id, keyVerified: false, keyCount: 0 });
  });

  it("refuses when the database has no live session for this token", async () => {
    const { service, member } = fakes({ console_auth_session: null });
    await expect(requireLinkSession({ db: member, service })).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  });

  it("refuses a session row that does not parse, rather than trusting a partial shape", async () => {
    const { service, member } = fakes({ console_auth_session: { ...SESSION, role: "root" } });
    await expect(requireLinkSession({ db: member, service })).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  });
});

describe("beginCeremony", () => {
  it("gives a member with no keys a registration challenge straight away", async () => {
    const { service, member, rpc } = fakes();
    const begun = await beginCeremony({ intent: "add_key", req: REQUEST, db: member, service });
    expect(begun.step).toBe("register");
    expect(rpc).toHaveBeenCalledWith("console_auth_new_challenge", expect.objectContaining({ p_purpose: "add_key" }));
  });

  it("makes a member who already holds a key tap it first", async () => {
    const { service, member, rpc } = fakes({ console_auth_session: { ...SESSION, key_count: 1 }, console_auth_keys_for_member: [KEY_ROW] });
    const begun = await beginCeremony({ intent: "add_key", req: REQUEST, db: member, service });
    expect(begun.step).toBe("tap");
    expect(rpc).toHaveBeenCalledWith("console_auth_new_challenge", expect.objectContaining({ p_purpose: "add_key_tap" }));
  });

  it("refuses to start a sign-in ceremony for a member with no keys at all", async () => {
    const { service, member } = fakes();
    await expect(beginCeremony({ intent: "sign_in", req: REQUEST, db: member, service })).rejects.toMatchObject({ status: 400 });
  });

  it("offers only this member's own keys", async () => {
    const { service, member, rpc } = fakes({ console_auth_session: { ...SESSION, key_count: 1, status: "active" }, console_auth_keys_for_member: [KEY_ROW] });
    await beginCeremony({ intent: "sign_in", req: REQUEST, db: member, service });
    expect(rpc).toHaveBeenCalledWith("console_auth_keys_for_member", { p_member: SESSION.member_id });
  });

  it("converts the database's base64 credential id to the base64url the browser is given", async () => {
    const { service, member } = fakes({ console_auth_session: { ...SESSION, key_count: 1, status: "active" }, console_auth_keys_for_member: [{ ...KEY_ROW, credential_id: "a+b/c9==" }] });
    const begun = await beginCeremony({ intent: "sign_in", req: REQUEST, db: member, service });
    expect(JSON.stringify(begun.options)).toContain("a-b_c9");
    expect(JSON.stringify(begun.options)).not.toContain("a+b/c9");
  });

  it("fails closed when a key row does not parse, rather than reading it as no keys", async () => {
    const { service, member } = fakes({
      console_auth_session: { ...SESSION, key_count: 1, status: "active" },
      console_auth_keys_for_member: [{ ...KEY_ROW, credential_id: null }],
    });
    // A member the session says holds one key, but whose actual row is unreadable, must not be
    // routed onto "register your first key" (step: "register") -- that would let a key be added
    // with no tap of the one already on file.
    await expect(beginCeremony({ intent: "add_key", req: REQUEST, db: member, service })).rejects.toMatchObject({ status: 401 });
  });
});

describe("completeSignIn", () => {
  it("refuses a challenge minted for a different session of the same member", async () => {
    const { service, member } = fakes({
      console_auth_session: { ...SESSION, key_count: 1, status: "active" },
      console_auth_keys_for_member: [KEY_ROW],
      console_auth_take_challenge: { challenge: "c", session_id: "99999999-9999-9999-9999-999999999999", purpose: "sign_in" },
    });
    await expect(
      completeSignIn({ req: REQUEST, response: responseWithChallenge("Y3JlZA") as never, db: member, service }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("refuses a credential the member does not hold", async () => {
    const { service, member } = fakes({
      console_auth_session: { ...SESSION, key_count: 1, status: "active" },
      console_auth_keys_for_member: [KEY_ROW],
      console_auth_take_challenge: { challenge: "c", session_id: SESSION.session_id, purpose: "sign_in" },
    });
    await expect(completeSignIn({ req: REQUEST, response: responseWithChallenge("other") as never, db: member, service })).rejects.toMatchObject({
      message: "This key isn't one of yours.",
    });
  });

  it("logs a failed tap, and does not verify the session", async () => {
    const { service, member, rpc } = fakes({
      console_auth_session: { ...SESSION, key_count: 1, status: "active" },
      console_auth_keys_for_member: [KEY_ROW],
      console_auth_take_challenge: null,
    });
    await expect(completeSignIn({ req: REQUEST, response: responseWithChallenge("Y3JlZA") as never, db: member, service })).rejects.toThrow();
    expect(rpc).toHaveBeenCalledWith("console_auth_write_audit", expect.objectContaining({ p_action: "Key tap failed", p_result: "failed" }));
    expect(rpc).not.toHaveBeenCalledWith("console_auth_verify_session", expect.anything());
  });
});

describe("completeRegistration", () => {
  it("activates the member at two keys and key-verifies the session with the new key", async () => {
    const { service, rpc, member } = fakes({
      console_auth_session: { ...SESSION, key_count: 1 },
      console_auth_keys_for_member: [KEY_ROW],
      console_auth_take_challenge: { challenge: "c", session_id: SESSION.session_id, purpose: "add_key" },
      console_auth_activate_member: true,
    });
    vi.doMock("@/console/keys/webauthn", () => ({}));
    const out = await completeRegistration({
      req: REQUEST,
      response: responseWithChallenge("bmV3") as never,
      name: "iPhone",
      db: member,
      service,
      verified: { credentialId: "bmV3", publicKey: "cHVia2V5", counter: 0, transports: ["internal"], keyType: "passkey" },
    });
    expect(out).toEqual({ keyCount: 2, activated: true });
    expect(rpc).toHaveBeenCalledWith("console_auth_record_key", expect.objectContaining({ p_name: "iPhone", p_type: "passkey" }));
    expect(rpc).toHaveBeenCalledWith("console_auth_verify_session", expect.objectContaining({ p_session_id: SESSION.session_id }));
    expect(rpc).toHaveBeenCalledWith("console_auth_write_audit", expect.objectContaining({ p_action: "Added a key", p_target: "iPhone" }));
  });

  it("leaves a member with one key in setup, and does not verify the session", async () => {
    const { service, rpc, member } = fakes({
      console_auth_take_challenge: { challenge: "c", session_id: SESSION.session_id, purpose: "add_key" },
      console_auth_activate_member: false,
    });
    const out = await completeRegistration({
      req: REQUEST,
      response: responseWithChallenge("bmV3") as never,
      name: "Blue key",
      db: member,
      service,
      verified: { credentialId: "bmV3", publicKey: "cHVia2V5", counter: 0, transports: [], keyType: "security_key" },
    });
    expect(out).toEqual({ keyCount: 1, activated: false });
    expect(rpc).not.toHaveBeenCalledWith("console_auth_verify_session", expect.anything());
  });

  it("turns the database's unique-credential refusal into the sheet's own line", async () => {
    const rpc = vi.fn((name: string) =>
      name === "console_auth_record_key"
        ? Promise.resolve({ data: null, error: { message: 'duplicate key value violates unique constraint "console_keys_credential_key"', code: "23505" } })
        : Promise.resolve({ data: name === "console_auth_take_challenge" ? { challenge: "c", session_id: SESSION.session_id, purpose: "add_key" } : name === "console_auth_session" ? SESSION : null, error: null }),
    );
    const service = { rpc } as unknown as ConsoleDb;
    const member = { auth: { getClaims: () => Promise.resolve({ data: { claims: { sub: SESSION.member_id, session_id: SESSION.session_id } }, error: null }) } } as unknown as ConsoleDb;
    await expect(
      completeRegistration({
        req: REQUEST,
        response: responseWithChallenge("bmV3") as never,
        name: "Blue key",
        db: member,
        service,
        verified: { credentialId: "bmV3", publicKey: "cHVia2V5", counter: 0, transports: [], keyType: "security_key" },
      }),
    ).rejects.toMatchObject({ message: "That key is already added. Use a different one." });
  });
});
