import { describe, expect, it, vi } from "vitest";
import type { ConsoleDb } from "@/console/auth/db";
import { changeMemberRole, getTeam, inviteTeamMember, removeTeamMember, resetMemberKeys } from "@/console/team/team";

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

function dbAnswering(result: { data?: unknown; error?: { message: string; code?: string } }): ConsoleDb {
  return { rpc: vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null })) } as unknown as ConsoleDb;
}

/** The db mock plus the spy on it, for the calls that also assert on the arguments sent. */
function dbSpy(result: { data?: unknown; error?: { message: string; code?: string } }): { readonly db: ConsoleDb; readonly rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }));
  return { db: { rpc } as unknown as ConsoleDb, rpc };
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

// console_invite_member (supabase/migrations/20260922090000_console_team.sql, extended by
// 20260922110000_console_invite_blocks_traveller.sql). Every one of its refusals is a developer
// string a member must never read as sent, so the mapping below is the whole point of this wrapper.
describe("inviteTeamMember", () => {
  const TOKEN = "a".repeat(64);
  const RESULT = { invite_id: "bbbbbbbb-0000-0000-0000-000000000001", token: TOKEN };
  const REASON = "Covering weekend leads.";

  it("passes all four arguments as text and returns the invite id and its raw token", async () => {
    const { db, rpc } = dbSpy({ data: RESULT });
    await expect(inviteTeamMember("priya@example.com", "support", REASON, "production", db)).resolves.toEqual({
      inviteId: "bbbbbbbb-0000-0000-0000-000000000001",
      token: TOKEN,
    });
    expect(rpc).toHaveBeenCalledWith("console_invite_member", {
      p_email: "priya@example.com",
      p_role: "support",
      p_reason: REASON,
      p_environment: "production",
    });
  });

  it("refuses a result that is not the shape console_invite_member returns", async () => {
    const db = dbAnswering({ data: { invite_id: "not-a-uuid", token: TOKEN } });
    await expect(inviteTeamMember("priya@example.com", "support", REASON, "production", db)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it("translates 'that address already belongs to a member'", async () => {
    const db = dbAnswering({ error: { message: "that address already belongs to a member" } });
    await expect(inviteTeamMember("devi@trakline.in", "support", REASON, "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "This address already belongs to a console member.",
    });
  });

  it("translates 'an invite is already open for that address'", async () => {
    const db = dbAnswering({ error: { message: "an invite is already open for that address" } });
    await expect(inviteTeamMember("nadia@trakline.in", "support", REASON, "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "This address already has an invite open. Resend or revoke that one instead.",
    });
  });

  it("translates 'that address already has a Trakline account' into the alert the sheet draws", async () => {
    const db = dbAnswering({ error: { message: "that address already has a Trakline account" } });
    await expect(inviteTeamMember("priya.shah@example.com", "support", REASON, "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "This address already has a Trakline account. Invite a dedicated console address.",
    });
  });

  // task-4-addendum.md §3 (Task 2 review finding M2): two Owners inviting the same brand-new
  // address at once both clear the console.invites pre-check, and the second lands on the live-email
  // unique index instead. A member must read the refusal the pre-check would have given, never a
  // raw Postgres constraint string.
  it("reads the live-email unique violation as the same refusal the pre-check would have given", async () => {
    const db = dbAnswering({ error: { message: 'duplicate key value violates unique constraint "console_invites_live_email_idx"', code: "23505" } });
    await expect(inviteTeamMember("nadia@trakline.in", "support", REASON, "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "This address already has an invite open. Resend or revoke that one instead.",
    });
  });

  it("translates console.use_tap's own 'no tap for this action'", async () => {
    const db = dbAnswering({ error: { message: "no tap for this action" } });
    await expect(inviteTeamMember("priya@example.com", "support", REASON, "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "That confirmation no longer matches this invite. Try inviting them again.",
    });
  });

  it("answers anything else with the console's own unavailable line, never the database's words", async () => {
    const db = dbAnswering({ error: { message: 'relation "console.invites" does not exist' } });
    await expect(inviteTeamMember("priya@example.com", "support", REASON, "production", db)).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
      message: "The console could not be reached. Try again.",
    });
  });
});

describe("changeMemberRole", () => {
  const MEMBER = "d1111111-1111-1111-1111-111111111111";
  const WHY = "Covering switches for the weekend on-call.";

  // Never an enum-typed argument to a public.console_* function: PostgREST casts it in the caller's
  // context, before `security definer` applies, and the call dies with "permission denied for
  // schema console" (20260921000000_console_enum_args_as_text.sql is the whole phase that cost).
  it("passes the member as a uuid and the role, reason and environment as text", async () => {
    const { db, rpc } = dbSpy({});
    await expect(changeMemberRole(MEMBER, "admin", WHY, "production", db)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("console_change_role", {
      p_member: MEMBER,
      p_role: "admin",
      p_reason: WHY,
      p_environment: "production",
    });
  });

  it("translates console.use_tap's own 'no tap for this action'", async () => {
    const db = dbAnswering({ error: { message: "no tap for this action", code: "42501" } });
    await expect(changeMemberRole(MEMBER, "admin", WHY, "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "That confirmation no longer matches this change. Try again.",
    });
  });

  // task-5-addendum.md §3. The last-Owner refusal is decided in the browser, from the roster the
  // page already has, so it never reaches here through the console's own UI -- only a race or a
  // hostile caller gets this far. What must never happen is the database's developer string
  // reaching a screen, and what must not happen either is this mapper deciding what that refusal
  // *means* by reading its words (confirm-its-you.tsx's own note explains why). So it is answered
  // by its SQLSTATE, with one sentence that is true of every console refusal alike.
  it("answers the last-Owner refusal by its errcode, in the console's own words, never the database's", async () => {
    const db = dbAnswering({ error: { message: "a console needs at least one owner", code: "42501" } });
    await expect(changeMemberRole(MEMBER, "admin", WHY, "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "The team has changed since this page loaded. Reload it and try again.",
    });
  });

  it("answers a vanished or removed target the same way", async () => {
    const db = dbAnswering({ error: { message: "no access", code: "42501" } });
    await expect(changeMemberRole(MEMBER, "admin", WHY, "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "The team has changed since this page loaded. Reload it and try again.",
    });
  });

  it("answers anything else with the console's own unavailable line, never the database's words", async () => {
    const db = dbAnswering({ error: { message: 'relation "console.members" does not exist', code: "42P01" } });
    await expect(changeMemberRole(MEMBER, "admin", WHY, "production", db)).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
      message: "The console could not be reached. Try again.",
    });
  });
});

describe("resetMemberKeys", () => {
  const MEMBER = "d1111111-1111-1111-1111-111111111111";
  const WHY = "Lost a security key on the train.";

  it("passes the member as a uuid and the reason and environment as text, and returns the count", async () => {
    const { db, rpc } = dbSpy({ data: 2 });
    await expect(resetMemberKeys(MEMBER, WHY, "production", db)).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledWith("console_reset_keys", { p_member: MEMBER, p_reason: WHY, p_environment: "production" });
  });

  // Parsed, never cast: console_reset_keys promises an integer and a caller builds a sentence out
  // of it, so a shape that drifted must fail closed rather than reach a toast as "NaN keys".
  it("refuses a count that is not a non-negative integer", async () => {
    for (const data of ["2", 2.5, -1, null]) {
      await expect(resetMemberKeys(MEMBER, WHY, "production", dbAnswering({ data }))).rejects.toMatchObject({
        code: "SOURCE_UNAVAILABLE",
        message: "The console could not be reached. Try again.",
      });
    }
  });

  // The genuine race (task-6-addendum.md §3): the browser mints over the count it rendered and the
  // database recounts inside its own transaction, so a key added or removed in between spends
  // against a digest the tap was never taken for. Failing closed is correct; a developer string on
  // screen is not.
  it("translates use_tap's own 'no tap for this action' into a sentence about the keys", async () => {
    const db = dbAnswering({ error: { message: "no tap for this action", code: "42501" } });
    await expect(resetMemberKeys(MEMBER, WHY, "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "That confirmation no longer matches this member's keys. Their keys changed since this page loaded; reload it and try again.",
    });
  });

  it("answers a vanished or removed target by its errcode, in the console's own words", async () => {
    const db = dbAnswering({ error: { message: "no access", code: "42501" } });
    await expect(resetMemberKeys(MEMBER, WHY, "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "The team has changed since this page loaded. Reload it and try again.",
    });
  });

  it("answers anything else with the console's own unavailable line, never the database's words", async () => {
    const db = dbAnswering({ error: { message: 'relation "console.keys" does not exist', code: "42P01" } });
    await expect(resetMemberKeys(MEMBER, WHY, "production", db)).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
      message: "The console could not be reached. Try again.",
    });
  });
});

describe("removeTeamMember", () => {
  const MEMBER = "d1111111-1111-1111-1111-111111111111";
  const WHY = "Left the support rota at the end of September.";

  it("passes the member as a uuid and the reason and environment as text", async () => {
    const { db, rpc } = dbSpy({});
    await expect(removeTeamMember(MEMBER, WHY, "production", db)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("console_remove_member", { p_member: MEMBER, p_reason: WHY, p_environment: "production" });
  });

  // The tap's own value here is the target's CURRENT role, which the page read and the database
  // re-reads under a lock -- so a role changed in another tab between mint and spend lands here.
  it("translates use_tap's own 'no tap for this action' into a sentence about the member", async () => {
    const db = dbAnswering({ error: { message: "no tap for this action", code: "42501" } });
    await expect(removeTeamMember(MEMBER, WHY, "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "That confirmation no longer matches this member. Their role changed since this page loaded; reload it and try again.",
    });
  });

  // Both of console_remove_member's own refusals share one developer string and one errcode with
  // every other console refusal, so they are answered by the code, never by reading the words --
  // and the browser decided both before any request went out anyway (task-6-addendum.md §4).
  it("answers the last-Owner and self-removal refusals by their errcode, in the console's own words", async () => {
    const db = dbAnswering({ error: { message: "a console needs at least one owner", code: "42501" } });
    await expect(removeTeamMember(MEMBER, WHY, "production", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "The team has changed since this page loaded. Reload it and try again.",
    });
  });

  it("answers anything else with the console's own unavailable line, never the database's words", async () => {
    const db = dbAnswering({ error: { message: 'relation "console.members" does not exist', code: "42P01" } });
    await expect(removeTeamMember(MEMBER, WHY, "production", db)).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
      message: "The console could not be reached. Try again.",
    });
  });
});
