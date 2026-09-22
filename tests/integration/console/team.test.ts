import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember, ConsoleRole } from "@/console/auth/member";
import type { NewInvite, Team } from "@/console/team/team";
import { AppError } from "@/services/errors";

// vi.mock's factory is hoisted above every import and above any ordinary top-level `const`, so the
// mocks it returns are declared with vi.hoisted and typed explicitly -- vi.fn(() => …) would infer
// a zero-argument signature (the same note tests/integration/console/my-keys.test.ts carries).
const { requireConsoleMember, getTeam, inviteTeamMember, consoleEnvironment, sendInviteLetter } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  getTeam: vi.fn<() => Promise<Team>>(),
  inviteTeamMember: vi.fn<(email: string, role: ConsoleRole, reason: string, environment: string) => Promise<NewInvite>>(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
  sendInviteLetter: vi.fn<(args: { to: string; token: string; role: ConsoleRole; invitedBy: string; origin: string }) => Promise<void>>(),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/team/team", () => ({ getTeam, inviteTeamMember }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
vi.mock("@/console/email/invite", () => ({ sendInviteLetter }));
// `after` runs its callback inline here, so a test can assert what the route scheduled -- the same
// stand-in tests/integration/console/sign-in.test.ts uses.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

import { GET, POST } from "@/app/console/api/team/route";

const URL_ = "http://admin.localhost:4210/console/api/team";

function post(body: unknown, headers: Record<string, string | null> = {}): Request {
  const finalHeaders: Record<string, string> = {
    "content-type": "application/json",
    "sec-fetch-site": "same-origin",
    // consoleOrigin reads this directly -- never the request URL, which the proxy rewrites
    // (task-4-addendum.md §4).
    host: "admin.localhost:4210",
  };
  for (const [key, value] of Object.entries(headers)) {
    if (value === null) delete finalHeaders[key];
    else finalHeaders[key] = value;
  }
  return new Request(URL_, { method: "POST", headers: finalHeaders, body: JSON.stringify(body) });
}

const OWNER: ConsoleMember = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
};

const TEAM: Team = { members: [], invites: [] };

const INVITE: NewInvite = { inviteId: "bbbbbbbb-0000-0000-0000-000000000001", token: "a".repeat(64) };

const GOOD = { email: "priya@example.com", role: "support", reason: "Priya is covering weekend leads." };

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(OWNER);
  getTeam.mockReset().mockResolvedValue(TEAM);
  inviteTeamMember.mockReset().mockResolvedValue(INVITE);
  consoleEnvironment.mockReset().mockReturnValue("production");
  sendInviteLetter.mockReset().mockResolvedValue();
});

describe("GET /api/team", () => {
  it("returns the roster and the pending invites for an Owner", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, members: [], invites: [] });
    expect(requireConsoleMember).toHaveBeenCalledWith("owner");
  });
});

describe("POST /api/team", () => {
  it("invites the address, lower-cased, at the role and reason it was given", async () => {
    const response = await POST(post({ ...GOOD, email: "Priya@Example.com" }));
    expect(response.status).toBe(200);
    expect(inviteTeamMember).toHaveBeenCalledWith("priya@example.com", "support", GOOD.reason, "production");
  });

  // task-4-addendum.md §3 (Task 2 review finding I3): the raw token is a console-access credential.
  // It is consumed server-side for the letter and never echoed to the inviting Owner's browser.
  it("never echoes the raw invite token into the response", async () => {
    const response = await POST(post(GOOD));
    const body: unknown = await response.json();
    expect(body).toEqual({ ok: true });
    expect(JSON.stringify(body)).not.toContain(INVITE.token);
  });

  it("schedules the letter with the origin consoleOrigin builds, never one taken from the request URL", async () => {
    await POST(post(GOOD));
    expect(sendInviteLetter).toHaveBeenCalledWith({
      to: "priya@example.com",
      token: INVITE.token,
      role: "support",
      invitedBy: "Asha Rao",
      origin: "http://admin.localhost:4210",
    });
  });

  it("hands sendInviteLetter an empty origin when the host header is not the console's, rather than a host a caller chose", async () => {
    await POST(post(GOOD, { host: "evil.example.com" }));
    expect(sendInviteLetter).toHaveBeenCalledWith(expect.objectContaining({ origin: "" }));
  });

  it("requires an Owner, not merely a member", async () => {
    await POST(post(GOOD));
    expect(requireConsoleMember).toHaveBeenCalledWith("owner");
  });

  it("refuses a cross-site request before it reaches the database", async () => {
    const response = await POST(post(GOOD, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(inviteTeamMember).not.toHaveBeenCalled();
  });

  it("refuses an address that is not an address", async () => {
    const response = await POST(post({ ...GOOD, email: "priya" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Enter an email address like name@example.com." });
    expect(inviteTeamMember).not.toHaveBeenCalled();
  });

  it("refuses a role that is not a role", async () => {
    const response = await POST(post({ ...GOOD, role: "superadmin" }));
    expect(response.status).toBe(400);
    expect(inviteTeamMember).not.toHaveBeenCalled();
  });

  // tapReason, the shared schema -- the same one /api/tap/options trimmed and digested at mint
  // (task-4-addendum.md §4). A reason under ten characters never reaches the database.
  it("refuses a reason the shared tapReason schema refuses", async () => {
    const response = await POST(post({ ...GOOD, reason: "too short" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Add a reason of at least 10 characters." });
    expect(inviteTeamMember).not.toHaveBeenCalled();
  });

  it("sends no letter when the invite itself was refused", async () => {
    inviteTeamMember.mockRejectedValue(new AppError("INVALID_INPUT", "This address already has a Trakline account. Invite a dedicated console address.", { status: 403 }));
    const response = await POST(post(GOOD));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ message: "This address already has a Trakline account. Invite a dedicated console address." });
    expect(sendInviteLetter).not.toHaveBeenCalled();
  });
});
