import { describe, expect, it, vi } from "vitest";
import { getMySessions, signOutOtherSessions } from "@/console/account/my-sessions";
import type { ConsoleDb } from "@/console/auth/db";

// console_my_sessions() itself (supabase/migrations/20260921100000_console_my_keys.sql): a bare
// jsonb array ordered `created_at desc, session_id` -- unlike console_my_keys, which wraps its rows
// in an object alongside the member. is_current is computed in the database from the caller's own
// claim, never trusted from the client.
const RPC_RESPONSE = [
  {
    session_id: "bbbbbbbb-0000-0000-0000-000000000001",
    device_label: "Chrome on macOS",
    last_seen_at: "2026-09-21T03:50:00Z",
    created_at: "2026-09-21T03:42:00Z",
    is_current: true,
  },
  {
    session_id: "bbbbbbbb-0000-0000-0000-000000000002",
    device_label: "Safari on iPhone",
    last_seen_at: "2026-09-20T17:15:00Z",
    created_at: "2026-09-18T17:10:00Z",
    is_current: false,
  },
];

function dbAnswering(result: { data?: unknown; error?: { message: string } }): ConsoleDb {
  return { rpc: vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null })) } as unknown as ConsoleDb;
}

describe("getMySessions", () => {
  it("returns the sessions console_my_sessions reports, camelCased", async () => {
    await expect(getMySessions(dbAnswering({ data: RPC_RESPONSE }))).resolves.toEqual([
      { id: "bbbbbbbb-0000-0000-0000-000000000001", deviceLabel: "Chrome on macOS", lastSeenAt: "2026-09-21T03:50:00Z", createdAt: "2026-09-21T03:42:00Z", isCurrent: true },
      { id: "bbbbbbbb-0000-0000-0000-000000000002", deviceLabel: "Safari on iPhone", lastSeenAt: "2026-09-20T17:15:00Z", createdAt: "2026-09-18T17:10:00Z", isCurrent: false },
    ]);
  });

  it("calls console_my_sessions and nothing else", async () => {
    const db = dbAnswering({ data: RPC_RESPONSE });
    await getMySessions(db);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("console_my_sessions");
  });

  it("returns an empty list rather than crash when there are none", async () => {
    await expect(getMySessions(dbAnswering({ data: [] }))).resolves.toEqual([]);
  });

  it("refuses when the database errors, rather than a partial result", async () => {
    await expect(getMySessions(dbAnswering({ error: { message: "connection refused" } }))).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
      status: 503,
      message: "The console could not be reached. Try again.",
    });
  });

  it("parses the shape rather than casting it -- a session missing required fields is refused, not passed through", async () => {
    const malformed = [{ session_id: "not-a-guid", device_label: "X" }];
    await expect(getMySessions(dbAnswering({ data: malformed }))).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  // console_my_keys wraps its rows in {keys, member}; console_my_sessions does not. A caller that
  // ever confused the two shapes must be refused, not silently handed an empty list via `?? []`.
  it("refuses a wrapped-object response, unlike console_my_keys' own shape", async () => {
    await expect(getMySessions(dbAnswering({ data: { sessions: RPC_RESPONSE } }))).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });
});

// console_sign_out_others(p_environment text) itself: one argument, no tap (spec: this only ever
// reduces the caller's own access), returns the count of sessions revoked.
describe("signOutOtherSessions", () => {
  it("calls console_sign_out_others with the caller's environment and returns the count revoked", async () => {
    const db = dbAnswering({ data: 2 });
    await expect(signOutOtherSessions("production", db)).resolves.toBe(2);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("console_sign_out_others", { p_environment: "production" });
  });

  it("returns zero rather than crash when there was nothing to sign out", async () => {
    await expect(signOutOtherSessions("production", dbAnswering({ data: 0 }))).resolves.toBe(0);
  });

  it("refuses with the shared unavailable line for any database fault", async () => {
    const db = dbAnswering({ error: { message: "connection refused" } });
    await expect(signOutOtherSessions("production", db)).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
      status: 503,
      message: "The console could not be reached. Try again.",
    });
  });

  it("refuses a non-numeric response rather than pass it through", async () => {
    const db = dbAnswering({ data: "2" });
    await expect(signOutOtherSessions("production", db)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });
});
