import { describe, expect, it, vi } from "vitest";
import { getMyKeys } from "@/console/account/my-keys";
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
