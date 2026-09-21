import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyKeys } from "@/console/account/my-keys";
import type { ConsoleMember } from "@/console/auth/member";
import type { TapRequest } from "@/console/keys/tap";
import { AppError } from "@/services/errors";

// vi.mock's factory is hoisted above every import and above any ordinary top-level `const` in this
// file, so the mocks it returns must be declared with vi.hoisted (same note as
// tests/integration/console/keys.test.ts and tests/integration/console/home.test.ts). Both mocks are
// typed explicitly -- vi.fn(() => …) infers a zero-argument signature (task-6-addendum.md §9).
const { requireConsoleMember, getMyKeys, renameMyKey, removeMyKey, consoleEnvironment, beginTap } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<() => Promise<ConsoleMember>>(),
  getMyKeys: vi.fn<() => Promise<MyKeys>>(),
  renameMyKey: vi.fn<(keyId: string, name: string, environment: string) => Promise<void>>(),
  removeMyKey: vi.fn<(keyId: string, reason: string, environment: string) => Promise<void>>(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
  beginTap: vi.fn<(args: { req: Request; tap: TapRequest }) => Promise<{ options: unknown }>>(),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/account/my-keys", () => ({ getMyKeys, renameMyKey, removeMyKey }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
// tapReason must stay real: /api/tap/options's own body schema validates and trims the reason with
// it, and the digest-agreement tests below rely on that real trimming behaviour. Only beginTap --
// the part that would otherwise run a real WebAuthn/database round trip -- is replaced.
vi.mock("@/console/keys/tap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/console/keys/tap")>();
  return { ...actual, beginTap };
});

import { DELETE, GET, PATCH } from "@/app/console/api/keys/mine/route";
import { POST as tapOptions } from "@/app/console/api/tap/options/route";

function patch(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", host: "admin.localhost:4210", ...headers },
  });
}

function del(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "DELETE",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", host: "admin.localhost:4210", ...headers },
  });
}

function tapOptionsRequest(body: unknown): Request {
  return new Request("http://admin.localhost:4210/console/api/tap/options", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", host: "admin.localhost:4210" },
  });
}

const MINE_URL = "http://admin.localhost:4210/console/api/keys/mine";

const MEMBER: ConsoleMember = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
};

const DATA: MyKeys = {
  keys: [{ id: "aaaaaaaa-0000-0000-0000-000000000001", name: "YubiKey 5C", type: "security_key", createdAt: "2026-09-02T10:00:00Z", lastUsedAt: null }],
  member: { name: "Asha Rao", email: "asha@trakline.in", role: "owner", createdAt: "2026-09-02T09:00:00Z" },
};

beforeEach(() => {
  requireConsoleMember.mockReset();
  getMyKeys.mockReset();
  renameMyKey.mockReset();
  removeMyKey.mockReset();
  consoleEnvironment.mockReset().mockReturnValue("production");
  beginTap.mockReset();
});

describe("GET /api/keys/mine", () => {
  it("returns the signed-in member's keys and profile in one round trip", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    getMyKeys.mockResolvedValue(DATA);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, keys: DATA.keys, member: DATA.member });
    expect(getMyKeys).toHaveBeenCalledOnce();
  });

  it("never reaches console_my_keys when there is no session", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("UNAUTHENTICATED", "Your session ended. Sign in again.", { status: 401 }));
    const response = await GET();
    expect(response.status).toBe(401);
    expect(getMyKeys).not.toHaveBeenCalled();
  });

  it("answers a database fault with the shared unavailable shape, not a raw error", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    getMyKeys.mockRejectedValue(new AppError("SOURCE_UNAVAILABLE", "The console could not be reached. Try again.", { status: 503 }));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });
});

const KEY_ID = "aaaaaaaa-0000-0000-0000-000000000003";

describe("PATCH /api/keys/mine", () => {
  it("renames the key through the caller's own environment and reports ok", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    renameMyKey.mockResolvedValue(undefined);
    const response = await PATCH(patch(MINE_URL, { keyId: KEY_ID, name: "MacBook Air" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(renameMyKey).toHaveBeenCalledExactlyOnceWith(KEY_ID, "MacBook Air", "production");
  });

  it("refuses a cross-site request before ever renaming anything", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    const response = await PATCH(patch(MINE_URL, { keyId: KEY_ID, name: "MacBook Air" }, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(renameMyKey).not.toHaveBeenCalled();
  });

  it("never reaches console_rename_key when there is no session", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("UNAUTHENTICATED", "Your session ended. Sign in again.", { status: 401 }));
    const response = await PATCH(patch(MINE_URL, { keyId: KEY_ID, name: "MacBook Air" }));
    expect(response.status).toBe(401);
    expect(renameMyKey).not.toHaveBeenCalled();
  });

  it("refuses an empty name without ever asking the database", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    const response = await PATCH(patch(MINE_URL, { keyId: KEY_ID, name: "   " }));
    expect(response.status).toBe(400);
    expect(renameMyKey).not.toHaveBeenCalled();
  });

  it("refuses a name longer than console.keys' own 60-character check, the same way verify's route does", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    const response = await PATCH(patch(MINE_URL, { keyId: KEY_ID, name: "x".repeat(61) }));
    expect(response.status).toBe(400);
    expect(renameMyKey).not.toHaveBeenCalled();
  });

  it("refuses a key id that is not a uuid", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    const response = await PATCH(patch(MINE_URL, { keyId: "not-a-guid", name: "MacBook Air" }));
    expect(response.status).toBe(400);
    expect(renameMyKey).not.toHaveBeenCalled();
  });

  it("answers a key that is not the caller's with the shared access refusal, not a 500", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    renameMyKey.mockRejectedValue(new AppError("INVALID_INPUT", "You don't have access to this.", { status: 403 }));
    const response = await PATCH(patch(MINE_URL, { keyId: "99999999-9999-9999-9999-999999999999", name: "Not mine" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, code: "INVALID_INPUT", message: "You don't have access to this." });
  });
});

const VALID_REASON = "Left at the old office; replaced.";

describe("DELETE /api/keys/mine", () => {
  it("removes the key through the caller's own environment and reports ok", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    removeMyKey.mockResolvedValue(undefined);
    const response = await DELETE(del(MINE_URL, { keyId: KEY_ID, reason: VALID_REASON }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(removeMyKey).toHaveBeenCalledExactlyOnceWith(KEY_ID, VALID_REASON, "production");
  });

  it("refuses a cross-site request before ever removing anything", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    const response = await DELETE(del(MINE_URL, { keyId: KEY_ID, reason: VALID_REASON }, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(removeMyKey).not.toHaveBeenCalled();
  });

  it("never reaches console_remove_key when there is no session", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("UNAUTHENTICATED", "Your session ended. Sign in again.", { status: 401 }));
    const response = await DELETE(del(MINE_URL, { keyId: KEY_ID, reason: VALID_REASON }));
    expect(response.status).toBe(401);
    expect(removeMyKey).not.toHaveBeenCalled();
  });

  it("refuses a reason under 10 characters without ever asking the database", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    const response = await DELETE(del(MINE_URL, { keyId: KEY_ID, reason: "short" }));
    expect(response.status).toBe(400);
    expect(removeMyKey).not.toHaveBeenCalled();
  });

  it("refuses a key id that is not a uuid", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    const response = await DELETE(del(MINE_URL, { keyId: "not-a-guid", reason: VALID_REASON }));
    expect(response.status).toBe(400);
    expect(removeMyKey).not.toHaveBeenCalled();
  });

  // tapReason applies .trim() -- the same transform that decided the digest at mint (tap-schema.ts's
  // own comment) -- so the route must send removeMyKey the trimmed string, not the raw body field,
  // or a trailing space here mints one digest and spends against another (task-8-addendum.md §3).
  it("trims the reason the same way the mint step did, before it ever reaches removeMyKey", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    removeMyKey.mockResolvedValue(undefined);
    await DELETE(del(MINE_URL, { keyId: KEY_ID, reason: `  ${VALID_REASON}  ` }));
    expect(removeMyKey).toHaveBeenCalledExactlyOnceWith(KEY_ID, VALID_REASON, "production");
  });

  it("answers the two-key floor with the sheet's own line, not the database's raw text", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    removeMyKey.mockRejectedValue(new AppError("INVALID_INPUT", "You need at least two keys. Add another before removing one.", { status: 403 }));
    const response = await DELETE(del(MINE_URL, { keyId: KEY_ID, reason: VALID_REASON }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, code: "INVALID_INPUT", message: "You need at least two keys. Add another before removing one." });
  });

  it("answers a key that is not the caller's with the console's own not-yours line, not a 500", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    removeMyKey.mockRejectedValue(new AppError("INVALID_INPUT", "This key isn't one of yours.", { status: 403 }));
    const response = await DELETE(del(MINE_URL, { keyId: "99999999-9999-9999-9999-999999999999", reason: VALID_REASON }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, code: "INVALID_INPUT", message: "This key isn't one of yours." });
  });
});

// The risk task-8-brief.md names first: "The four fields must match on both sides exactly." `value`
// is the remaining count as a decimal string -- console_remove_key computes it as
// `(count - 1)::text` (supabase/migrations/20260921100000_console_my_keys.sql). These drive both
// /api/tap/options (the mint) and DELETE /api/keys/mine (the spend) through their own real route
// handlers, against fakes, so a one-off disagreement between the two fails here rather than as
// "no tap for this action" in a browser (task-8-brief.md, task-8-addendum.md §2).
describe("the route carries the tap's four fields through without mangling them", () => {
  it("passes action, target and value to beginTap exactly as received -- the agreement with console_remove_key's own formula is proved in supabase/tests/console_my_keys.test.sql and keys-plate.test.tsx, not here", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    beginTap.mockResolvedValue({ options: { challenge: "action-challenge" } });
    // KEYS_BEFORE_REMOVAL keys exist; console_remove_key computes v_remaining as count(*) - 1, so a
    // client about to remove one of KEYS_BEFORE_REMOVAL keys must mint for KEYS_BEFORE_REMOVAL - 1.
    const KEYS_BEFORE_REMOVAL = 3;
    const response = await tapOptions(
      tapOptionsRequest({ action: "Removed a key", target: "YubiKey 5 NFC", value: String(KEYS_BEFORE_REMOVAL - 1), reason: VALID_REASON }),
    );
    expect(response.status).toBe(200);
    expect(beginTap).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ tap: { action: "Removed a key", target: "YubiKey 5 NFC", value: "2", reason: VALID_REASON } }),
    );
  });

  it("spends against the same key and the same trimmed reason the mint was bound to", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    removeMyKey.mockResolvedValue(undefined);
    const response = await DELETE(del(MINE_URL, { keyId: KEY_ID, reason: VALID_REASON }));
    expect(response.status).toBe(200);
    // console_remove_key recomputes v_remaining itself from count(*) -- it takes no `value` argument
    // at all (p_key, p_reason, p_environment only), which is exactly why a stale client-side count is
    // the one disagreement this test cannot catch, and console.use_tap's "no tap for this action" is
    // the correct answer when it happens (task-8-addendum.md §2, not a bug to route around).
    expect(removeMyKey).toHaveBeenCalledExactlyOnceWith(KEY_ID, VALID_REASON, "production");
  });

  it("both endpoints trim the same reason to the same string, so neither digest is taken over untrimmed text", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    beginTap.mockResolvedValue({ options: { challenge: "c" } });
    removeMyKey.mockResolvedValue(undefined);
    const padded = `  ${VALID_REASON}  `;

    await tapOptions(tapOptionsRequest({ action: "Removed a key", target: "YubiKey 5 NFC", value: "2", reason: padded }));
    expect(beginTap).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tap: expect.objectContaining({ reason: VALID_REASON }) }));

    await DELETE(del(MINE_URL, { keyId: KEY_ID, reason: padded }));
    expect(removeMyKey).toHaveBeenCalledExactlyOnceWith(KEY_ID, VALID_REASON, "production");
  });
});
