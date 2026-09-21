import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleDb } from "@/console/auth/db";

// verifyTap's "happy path" tests need verifyAuthentication to actually succeed, which the real
// @simplewebauthn/server cannot do against a fabricated response. Every other export of this
// module stays real via importOriginal -- beginTap's tests depend on the real
// generateAuthenticationOptions output (authenticationOptionsFor is never mocked). vi.hoisted, not
// a plain const: vi.mock's factory is hoisted above this file's own top-level consts. Same note as
// tests/unit/console/keys/ceremony.test.ts.
const { verifyAuthentication } = vi.hoisted(() => ({
  verifyAuthentication: vi.fn<(...args: unknown[]) => Promise<{ credentialId: string; newCounter: number }>>(),
}));
vi.mock("@/console/keys/webauthn", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/console/keys/webauthn")>();
  return { ...actual, verifyAuthentication };
});

import { beginTap, verifyTap } from "@/console/keys/tap";

const RP = { id: "admin.localhost", origin: "http://admin.localhost:4210", name: "Trakline Console" };
const MEMBER = {
  user_id: "11111111-1111-1111-1111-111111111111",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
};
const SESSION_ID = "22222222-2222-2222-2222-222222222222";
const KEY_ROW = { id: "33333333-3333-3333-3333-333333333333", credential_id: "Y3JlZA==", public_key: "cHVia2V5", counter: 3, transports: ["usb"] };
const TAP_REQUEST = { action: "Removed a key", target: "YubiKey 5 NFC", value: "2", reason: "Left at the old office." };

/**
 * A ceremony response carrying just enough of the real WebAuthn shape for `challengeFrom` to read a
 * challenge back out of `clientDataJSON` -- every verifyTap test needs this, even the ones whose
 * fake RPC ignores the challenge's actual value, because `challengeFrom` runs before any of them and
 * a bare `{id}` throws "didn't answer" first. Copied from ceremony.test.ts's own helper: tap.ts has
 * no shared module with ceremony.ts to import it from.
 */
function responseWithChallenge(id: string, challenge = "c"): { id: string; response: { clientDataJSON: string } } {
  return { id, response: { clientDataJSON: Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: RP.origin })).toString("base64url") } };
}

function fakes(overrides: { readonly member?: unknown; readonly service?: Record<string, unknown>; readonly claims?: unknown } = {}) {
  const serviceAnswers: Record<string, unknown> = {
    console_auth_keys_for_member: [],
    console_auth_new_action_challenge: "44444444-4444-4444-4444-444444444444",
    console_auth_read_challenge: null,
    console_auth_touch_key: null,
    console_auth_write_audit: "55555555-5555-5555-5555-555555555555",
    ...overrides.service,
  };
  const rpc = vi.fn((name: string) => Promise.resolve({ data: serviceAnswers[name] ?? null, error: null }));
  const service = { rpc } as unknown as ConsoleDb;

  const memberRpc = vi.fn((name: string) => (name === "console_me" ? Promise.resolve({ data: overrides.member ?? MEMBER, error: null }) : Promise.resolve({ data: null, error: null })));
  const db = {
    rpc: memberRpc,
    auth: { getClaims: () => Promise.resolve({ data: { claims: overrides.claims ?? { sub: MEMBER.user_id, session_id: SESSION_ID } }, error: null }) },
  } as unknown as ConsoleDb;

  return { service, db, rpc, memberRpc };
}

const REQUEST = new Request("http://admin.localhost:4210/console/api/tap/options", { headers: { host: "admin.localhost:4210" } });

beforeEach(() => vi.clearAllMocks());

describe("beginTap", () => {
  it("mints an action challenge with all four fields passed through verbatim", async () => {
    const { service, db, rpc } = fakes();
    const begun = await beginTap({ req: REQUEST, tap: TAP_REQUEST, db, service });
    expect(begun.options).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith(
      "console_auth_new_action_challenge",
      expect.objectContaining({
        p_member: MEMBER.user_id,
        p_session: SESSION_ID,
        p_action: "Removed a key",
        p_target: "YubiKey 5 NFC",
        p_value: "2",
        p_reason: "Left at the old office.",
      }),
    );
  });

  it("offers only this member's own keys, converted from the database's base64 to base64url", async () => {
    const { service, db } = fakes({ service: { console_auth_keys_for_member: [{ ...KEY_ROW, credential_id: "a+b/c9==" }] } });
    const begun = await beginTap({ req: REQUEST, tap: TAP_REQUEST, db, service });
    expect(JSON.stringify(begun.options)).toContain("a-b_c9");
    expect(JSON.stringify(begun.options)).not.toContain("a+b/c9");
  });

  it("asks console_auth_keys_for_member for this member's own id", async () => {
    const { service, db, rpc } = fakes({ service: { console_auth_keys_for_member: [KEY_ROW] } });
    await beginTap({ req: REQUEST, tap: TAP_REQUEST, db, service });
    expect(rpc).toHaveBeenCalledWith("console_auth_keys_for_member", { p_member: MEMBER.user_id });
  });
});

describe("verifyTap", () => {
  it("reads the challenge with console_auth_read_challenge and never spends it", async () => {
    const { service, db, rpc } = fakes({
      service: { console_auth_keys_for_member: [KEY_ROW], console_auth_read_challenge: { session_id: SESSION_ID, purpose: "action" } },
    });
    verifyAuthentication.mockResolvedValueOnce({ credentialId: KEY_ROW.credential_id, newCounter: KEY_ROW.counter + 1 });
    await verifyTap({ req: REQUEST, response: responseWithChallenge("Y3JlZA") as never, db, service });
    expect(rpc).toHaveBeenCalledWith("console_auth_read_challenge", expect.objectContaining({ p_member: MEMBER.user_id, p_purpose: "action" }));
    // This is the assertion that keeps the tap spendable by the database: console.use_tap() must
    // still find it unused when the action itself runs.
    expect(rpc).not.toHaveBeenCalledWith("console_auth_take_challenge", expect.anything());
  });

  it("refuses a challenge the read does not find -- expired, spent, or the wrong purpose", async () => {
    const { service, db, rpc } = fakes({ service: { console_auth_keys_for_member: [KEY_ROW], console_auth_read_challenge: null } });
    await expect(verifyTap({ req: REQUEST, response: responseWithChallenge("Y3JlZA") as never, db, service })).rejects.toMatchObject({
      status: 400,
      message: "That key didn't answer. Try again.",
    });
    expect(rpc).toHaveBeenCalledWith("console_auth_write_audit", expect.objectContaining({ p_action: "Key tap failed", p_result: "failed" }));
    expect(rpc).not.toHaveBeenCalledWith("console_auth_touch_key", expect.anything());
  });

  it("refuses a challenge minted for a different session of the same member", async () => {
    const { service, db } = fakes({
      service: {
        console_auth_keys_for_member: [KEY_ROW],
        console_auth_read_challenge: { session_id: "99999999-9999-9999-9999-999999999999", purpose: "action" },
      },
    });
    await expect(verifyTap({ req: REQUEST, response: responseWithChallenge("Y3JlZA") as never, db, service })).rejects.toMatchObject({ status: 401 });
  });

  it("refuses a credential this member does not hold, and logs it as a failed tap", async () => {
    const { service, db, rpc } = fakes({
      service: { console_auth_keys_for_member: [KEY_ROW], console_auth_read_challenge: { session_id: SESSION_ID, purpose: "action" } },
    });
    await expect(verifyTap({ req: REQUEST, response: responseWithChallenge("other") as never, db, service })).rejects.toMatchObject({
      message: "This key isn't one of yours.",
    });
    expect(rpc).toHaveBeenCalledWith("console_auth_write_audit", expect.objectContaining({ p_action: "Key tap failed", p_result: "failed" }));
  });

  it("touches the key with the verified new counter, not one the caller supplied", async () => {
    const { service, db, rpc } = fakes({
      service: { console_auth_keys_for_member: [KEY_ROW], console_auth_read_challenge: { session_id: SESSION_ID, purpose: "action" } },
    });
    verifyAuthentication.mockResolvedValueOnce({ credentialId: KEY_ROW.credential_id, newCounter: 999 });
    await verifyTap({ req: REQUEST, response: { ...responseWithChallenge("Y3JlZA"), counter: 1 } as never, db, service });
    expect(rpc).toHaveBeenCalledWith("console_auth_touch_key", { p_key: KEY_ROW.id, p_counter: 999 });
  });

  it("logs a failed tap and never touches the key when the assertion does not verify", async () => {
    const { service, db, rpc } = fakes({
      service: { console_auth_keys_for_member: [KEY_ROW], console_auth_read_challenge: { session_id: SESSION_ID, purpose: "action" } },
    });
    verifyAuthentication.mockRejectedValueOnce(new Error("bad signature"));
    await expect(verifyTap({ req: REQUEST, response: responseWithChallenge("Y3JlZA") as never, db, service })).rejects.toThrow();
    expect(rpc).toHaveBeenCalledWith("console_auth_write_audit", expect.objectContaining({ p_action: "Key tap failed", p_result: "failed" }));
    expect(rpc).not.toHaveBeenCalledWith("console_auth_touch_key", expect.anything());
  });
});
