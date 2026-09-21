import { describe, expect, it, vi } from "vitest";
import { getMyKeys, removeMyKey, renameMyKey } from "@/console/account/my-keys";
import type { ConsoleDb } from "@/console/auth/db";

// console_my_keys() itself (20260921100000_console_my_keys.sql): both halves, one call.
const RPC_RESPONSE = {
  keys: [
    { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "YubiKey 5C", type: "security_key", created_at: "2026-09-02T10:00:00Z", last_used_at: "2026-09-19T08:32:00Z" },
    { id: "aaaaaaaa-0000-0000-0000-000000000003", name: "MacBook Pro", type: "passkey", created_at: "2026-09-05T10:00:00Z", last_used_at: null },
  ],
  member: { name: "Asha Rao", email: "asha@trakline.in", role: "owner", created_at: "2026-09-02T09:00:00Z" },
};

function dbAnswering(result: { data?: unknown; error?: { message: string } }): ConsoleDb {
  return { rpc: vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null })) } as unknown as ConsoleDb;
}

describe("getMyKeys", () => {
  it("returns the keys and profile console_my_keys reports, camelCased", async () => {
    await expect(getMyKeys(dbAnswering({ data: RPC_RESPONSE }))).resolves.toEqual({
      keys: [
        { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "YubiKey 5C", type: "security_key", createdAt: "2026-09-02T10:00:00Z", lastUsedAt: "2026-09-19T08:32:00Z" },
        { id: "aaaaaaaa-0000-0000-0000-000000000003", name: "MacBook Pro", type: "passkey", createdAt: "2026-09-05T10:00:00Z", lastUsedAt: null },
      ],
      member: { name: "Asha Rao", email: "asha@trakline.in", role: "owner", createdAt: "2026-09-02T09:00:00Z" },
    });
  });

  it("calls console_my_keys and nothing else", async () => {
    const db = dbAnswering({ data: RPC_RESPONSE });
    await getMyKeys(db);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("console_my_keys");
  });

  it("never reads credential_id or public_key through, even if a row somehow carried them", async () => {
    const withCredential = {
      keys: [{ ...RPC_RESPONSE.keys[0], credential_id: "\\x01", public_key: "\\x0a" }],
      member: RPC_RESPONSE.member,
    };
    const result = await getMyKeys(dbAnswering({ data: withCredential }));
    expect(result.keys[0]).not.toHaveProperty("credential_id");
    expect(result.keys[0]).not.toHaveProperty("public_key");
    expect(Object.keys(result.keys[0]).sort()).toEqual(["createdAt", "id", "lastUsedAt", "name", "type"]);
  });

  it("refuses when the database errors, rather than a partial result", async () => {
    await expect(getMyKeys(dbAnswering({ error: { message: "connection refused" } }))).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
      status: 503,
      message: "The console could not be reached. Try again.",
    });
  });

  it("parses the shape rather than casting it -- a key missing required fields is refused, not passed through", async () => {
    const malformed = { keys: [{ id: "not-a-guid", name: "X" }], member: RPC_RESPONSE.member };
    await expect(getMyKeys(dbAnswering({ data: malformed }))).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it("refuses a key type it does not recognise rather than passing it through unchecked", async () => {
    const badType = { keys: [{ ...RPC_RESPONSE.keys[0], type: "master_key" }], member: RPC_RESPONSE.member };
    await expect(getMyKeys(dbAnswering({ data: badType }))).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it("refuses a response with no member half at all", async () => {
    await expect(getMyKeys(dbAnswering({ data: { keys: [] } }))).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });
});

// console_rename_key(p_key uuid, p_name text, p_environment text) itself
// (supabase/migrations/20260921100000_console_my_keys.sql): three arguments, no tap
// (task-7-addendum.md §2).
describe("renameMyKey", () => {
  it("calls console_rename_key with the key, the name and the caller's environment", async () => {
    const db = dbAnswering({ data: null });
    await renameMyKey("aaaaaaaa-0000-0000-0000-000000000003", "MacBook Air", "production", db);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("console_rename_key", {
      p_key: "aaaaaaaa-0000-0000-0000-000000000003",
      p_name: "MacBook Air",
      p_environment: "production",
    });
  });

  // The same line removal shows for the same database refusal. Renaming and removing both act on
  // a key, so both name the key rather than the page: "This key isn't one of yours" tells the
  // member the thing they need to know, where the generic access line does not.
  it("answers a key that is not the caller's with the console's own not-yours line, not a fault", async () => {
    const db = dbAnswering({ error: { message: "no access" } });
    await expect(renameMyKey("99999999-9999-9999-9999-999999999999", "Not mine", "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      status: 403,
      message: "This key isn't one of yours.",
    });
  });

  it("refuses with the shared unavailable line for any other database fault", async () => {
    const db = dbAnswering({ error: { message: "connection refused" } });
    await expect(renameMyKey("aaaaaaaa-0000-0000-0000-000000000003", "MacBook Air", "production", db)).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
      status: 503,
      message: "The console could not be reached. Try again.",
    });
  });
});

// console_remove_key(p_key uuid, p_reason text, p_environment text) itself
// (supabase/migrations/20260921100000_console_my_keys.sql): three arguments -- the reason reaches it
// exactly as the route received it (task-8-addendum.md §4.4: console.write_audit scrubs at the
// moment of storage, and scrubbing here first would digest one string while console.use_tap
// recomputes over another).
describe("removeMyKey", () => {
  it("calls console_remove_key with the key, the reason and the caller's environment", async () => {
    const db = dbAnswering({ data: 2 });
    await removeMyKey("aaaaaaaa-0000-0000-0000-000000000003", "Left at the old office; replaced.", "production", db);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("console_remove_key", {
      p_key: "aaaaaaaa-0000-0000-0000-000000000003",
      p_reason: "Left at the old office; replaced.",
      p_environment: "production",
    });
  });

  // task-8-addendum.md §4.3: this is the sheet's own two-key line, not console's generic
  // access-refusal wording -- a member reading it must never see the database's raw
  // "a member must keep at least two keys".
  it("answers the two-key floor with the sheet's own line, not the database's raw text", async () => {
    const db = dbAnswering({ error: { message: "a member must keep at least two keys" } });
    await expect(removeMyKey("aaaaaaaa-0000-0000-0000-000000000001", "Trying anyway.", "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      status: 403,
      message: "You need at least two keys. Add another before removing one.",
    });
  });

  // task-8-addendum.md §4.3: 'no access' means the key is not this member's -- the same line
  // tap.ts's own keyFor() shows for a key that answered a tap but isn't one of the member's.
  it("answers a key that is not the caller's with the console's own not-yours line, not a fault", async () => {
    const db = dbAnswering({ error: { message: "no access" } });
    await expect(removeMyKey("99999999-9999-9999-9999-999999999999", "Not mine.", "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      status: 403,
      message: "This key isn't one of yours.",
    });
  });

  it("refuses with the shared unavailable line for any other database fault", async () => {
    const db = dbAnswering({ error: { message: "connection refused" } });
    await expect(removeMyKey("aaaaaaaa-0000-0000-0000-000000000003", "Left at the old office; replaced.", "production", db)).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
      status: 503,
      message: "The console could not be reached. Try again.",
    });
  });

  // "no tap for this action" (console.use_tap's own refusal, task-8-addendum.md §2) falls through
  // to the same shared line rather than a bespoke translation: it is not one of the two refusals
  // the sheet drew copy for, so it gets the fallback every other unmapped database fault gets.
  it("refuses a spent or mismatched tap with the shared unavailable line, not the database's raw text", async () => {
    const db = dbAnswering({ error: { message: "no tap for this action" } });
    await expect(removeMyKey("aaaaaaaa-0000-0000-0000-000000000003", "Left at the old office; replaced.", "production", db)).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
      status: 503,
      message: "The console could not be reached. Try again.",
    });
  });
});
