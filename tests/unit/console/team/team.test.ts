import { describe, expect, it, vi } from "vitest";
import type { ConsoleDb } from "@/console/auth/db";
import { getTeam } from "@/console/team/team";

// console_team() itself (supabase/migrations/20260922090000_console_team.sql): both halves, one
// call, never a token_hash. Dates arrive from Postgres with an offset ("+00:00"), not "Z" -- the
// fixture below uses that literal shape for last_active_at rather than every fixture writing "Z" by
// hand, the exact gap that shipped a production bug for the watchlist
// (docs/superpowers/plans/2026-09-22-phase-2d2-team.md's own global constraints).
const RPC_RESPONSE = {
  members: [
    {
      user_id: "aaaaaaaa-0000-0000-0000-000000000001",
      email: "asha@trakline.in",
      name: "Asha Rao",
      role: "owner",
      status: "active",
      key_count: 2,
      last_active_at: "2026-09-21T19:10:34.256374+00:00",
    },
    {
      user_id: "aaaaaaaa-0000-0000-0000-000000000002",
      email: "meera@trakline.in",
      name: "Meera Nair",
      role: "viewer",
      status: "setup",
      key_count: 1,
      last_active_at: null,
    },
  ],
  invites: [
    {
      id: "bbbbbbbb-0000-0000-0000-000000000001",
      email: "priya@trakline.in",
      role: "support",
      sent_at: "2026-09-19T09:00:00Z",
      expires_at: "2026-09-26T09:00:00Z",
    },
  ],
};

function dbAnswering(result: { data?: unknown; error?: { message: string } }): ConsoleDb {
  return { rpc: vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null })) } as unknown as ConsoleDb;
}

describe("getTeam", () => {
  it("returns the members and invites console_team reports, camelCased", async () => {
    await expect(getTeam(dbAnswering({ data: RPC_RESPONSE }))).resolves.toEqual({
      members: [
        {
          userId: "aaaaaaaa-0000-0000-0000-000000000001",
          email: "asha@trakline.in",
          name: "Asha Rao",
          role: "owner",
          status: "active",
          keyCount: 2,
          lastActiveAt: "2026-09-21T19:10:34.256374+00:00",
        },
        {
          userId: "aaaaaaaa-0000-0000-0000-000000000002",
          email: "meera@trakline.in",
          name: "Meera Nair",
          role: "viewer",
          status: "setup",
          keyCount: 1,
          lastActiveAt: null,
        },
      ],
      invites: [
        {
          id: "bbbbbbbb-0000-0000-0000-000000000001",
          email: "priya@trakline.in",
          role: "support",
          sentAt: "2026-09-19T09:00:00Z",
          expiresAt: "2026-09-26T09:00:00Z",
        },
      ],
    });
  });

  it("calls console_team and nothing else", async () => {
    const db = dbAnswering({ data: RPC_RESPONSE });
    await getTeam(db);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("console_team");
  });

  it("never reads a token_hash through, even if a row somehow carried one", async () => {
    const withHash = { members: RPC_RESPONSE.members, invites: [{ ...RPC_RESPONSE.invites[0], token_hash: "\\xdeadbeef" }] };
    const result = await getTeam(dbAnswering({ data: withHash }));
    expect(result.invites[0]).not.toHaveProperty("token_hash");
    expect(Object.keys(result.invites[0]!).sort()).toEqual(["email", "expiresAt", "id", "role", "sentAt"]);
  });

  it("refuses when the database errors, rather than a partial result", async () => {
    await expect(getTeam(dbAnswering({ error: { message: "connection refused" } }))).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
      status: 503,
      message: "The console could not be reached. Try again.",
    });
  });

  // task-3-addendum.md §3: "a malformed row must fail closed, not render as undefined."
  it("parses the shape rather than casting it -- a member missing required fields is refused, not passed through", async () => {
    const malformed = { members: [{ user_id: "not-a-guid", name: "X" }], invites: [] };
    await expect(getTeam(dbAnswering({ data: malformed }))).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it("refuses a role it does not recognise rather than passing it through unchecked", async () => {
    const badRole = { members: [{ ...RPC_RESPONSE.members[0], role: "superadmin" }], invites: [] };
    await expect(getTeam(dbAnswering({ data: badRole }))).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  // console_team's own where clause excludes 'removed' members (they fall out of the roster
  // entirely); a row carrying that status anyway is not this console's ordinary shape and must fail
  // closed rather than render a member who no longer has access.
  it("refuses a status it does not expect to see here, including 'removed'", async () => {
    const removedSnuckIn = { members: [{ ...RPC_RESPONSE.members[0], status: "removed" }], invites: [] };
    await expect(getTeam(dbAnswering({ data: removedSnuckIn }))).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it("refuses a last_active_at with no time component -- the offset fix's opposite mistake", async () => {
    const badDate = { members: [{ ...RPC_RESPONSE.members[0], last_active_at: "2026-09-21" }], invites: [] };
    await expect(getTeam(dbAnswering({ data: badDate }))).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it("refuses an invite with a malformed expires_at", async () => {
    const badInvite = { members: [], invites: [{ ...RPC_RESPONSE.invites[0], expires_at: "not-a-date" }] };
    await expect(getTeam(dbAnswering({ data: badInvite }))).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it("refuses a response with no invites half at all", async () => {
    await expect(getTeam(dbAnswering({ data: { members: [] } }))).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });
});
