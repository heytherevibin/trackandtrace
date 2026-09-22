import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember, ConsoleRole } from "@/console/auth/member";
import type { ResentInvite } from "@/console/team/team";
import { AppError } from "@/services/errors";

// POST /api/team/invite (resend) and DELETE /api/team/invite (revoke) -- task-7. Shaped exactly on
// tests/integration/console/team.test.ts: vi.mock's factory is hoisted above every import and above
// any ordinary top-level `const`, so the mocks it returns come from vi.hoisted and are typed
// explicitly -- vi.fn(() => …) would infer a zero-argument signature.
const { requireConsoleMember, resendTeamInvite, revokeTeamInvite, consoleEnvironment, sendInviteLetter } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  resendTeamInvite: vi.fn<(invite: string, environment: string) => Promise<ResentInvite>>(),
  revokeTeamInvite: vi.fn<(invite: string, reason: string, environment: string) => Promise<void>>(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
  sendInviteLetter: vi.fn<(args: { to: string; token: string; role: ConsoleRole; invitedBy: string; origin: string }) => Promise<void>>(),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/team/team", () => ({ resendTeamInvite, revokeTeamInvite }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
vi.mock("@/console/email/invite", () => ({ sendInviteLetter }));
// `after` runs its callback inline here, so a test can assert what the route scheduled -- the same
// stand-in tests/integration/console/team.test.ts uses for the first invite's own letter.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

import { DELETE, POST } from "@/app/console/api/team/invite/route";

const URL_ = "http://admin.localhost:4210/console/api/team/invite";

function request(method: "POST" | "DELETE", body: unknown, headers: Record<string, string | null> = {}): Request {
  const finalHeaders: Record<string, string> = {
    "content-type": "application/json",
    "sec-fetch-site": "same-origin",
    // consoleOrigin reads this directly -- never the request URL, which the proxy rewrites
    // (task-7-addendum.md §4).
    host: "admin.localhost:4210",
  };
  for (const [key, value] of Object.entries(headers)) {
    if (value === null) delete finalHeaders[key];
    else finalHeaders[key] = value;
  }
  return new Request(URL_, { method, headers: finalHeaders, body: JSON.stringify(body) });
}

const OWNER: ConsoleMember = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
};

const INVITE = "bbbbbbbb-0000-0000-0000-000000000001";
const RESENT: ResentInvite = { inviteId: INVITE, token: "b".repeat(64), email: "priya@trakline.in", role: "support" };

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(OWNER);
  resendTeamInvite.mockReset().mockResolvedValue(RESENT);
  revokeTeamInvite.mockReset().mockResolvedValue();
  consoleEnvironment.mockReset().mockReturnValue("production");
  sendInviteLetter.mockReset().mockResolvedValue();
});

describe("POST /api/team/invite -- resending", () => {
  it("resends the invite by id and answers with nothing but ok", async () => {
    const response = await POST(request("POST", { invite: INVITE }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(resendTeamInvite).toHaveBeenCalledWith(INVITE, "production");
  });

  // task-7-addendum.md §4, carried from task-4-addendum.md §3 (the Task 2 review's finding I3):
  // console_resend_invite mints a FRESH raw token, which is a console-access credential. It is
  // consumed here, server-side, for the letter; the Owner's browser gets `{ ok: true }`.
  it("never echoes the fresh invite token into the response", async () => {
    const response = await POST(request("POST", { invite: INVITE }));
    const body: unknown = await response.json();
    expect(body).toEqual({ ok: true });
    expect(JSON.stringify(body)).not.toContain(RESENT.token);
  });

  // The address and role come back with the token rather than from a second read, and the origin
  // from consoleOrigin(host) -- never `new URL(req.url).origin`, which the proxy rewrites.
  it("schedules the letter to the invite's own address, with the origin consoleOrigin builds", async () => {
    await POST(request("POST", { invite: INVITE }));
    expect(sendInviteLetter).toHaveBeenCalledWith({
      to: "priya@trakline.in",
      token: RESENT.token,
      role: "support",
      invitedBy: "Asha Rao",
      origin: "http://admin.localhost:4210",
    });
  });

  it("hands sendInviteLetter an empty origin when the host header is not the console's, rather than a host a caller chose", async () => {
    await POST(request("POST", { invite: INVITE }, { host: "evil.example.com" }));
    expect(sendInviteLetter).toHaveBeenCalledWith(expect.objectContaining({ origin: "" }));
  });

  it("requires an Owner, not merely a member", async () => {
    await POST(request("POST", { invite: INVITE }));
    expect(requireConsoleMember).toHaveBeenCalledWith("owner");
  });

  it("refuses a cross-site request before it reaches the database", async () => {
    const response = await POST(request("POST", { invite: INVITE }, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(resendTeamInvite).not.toHaveBeenCalled();
  });

  it("refuses an invite id that is not a uuid", async () => {
    const response = await POST(request("POST", { invite: "priya@trakline.in" }));
    expect(response.status).toBe(400);
    expect(resendTeamInvite).not.toHaveBeenCalled();
  });

  // One field and no more. A reason in particular has no business here: console_resend_invite takes
  // none and spends no tap, so a body carrying one would be a caller asserting a ceremony that
  // never happened -- and `p_environment` is always the server's to decide.
  it("refuses a body carrying anything else, a reason included", async () => {
    const response = await POST(request("POST", { invite: INVITE, reason: "Their first letter bounced." }));
    expect(response.status).toBe(400);
    expect(resendTeamInvite).not.toHaveBeenCalled();
  });

  it("sends no letter when the resend itself was refused", async () => {
    const message = "The team has changed since this page loaded. Reload it and try again.";
    resendTeamInvite.mockRejectedValue(new AppError("INVALID_INPUT", message, { status: 403 }));
    const response = await POST(request("POST", { invite: INVITE }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ message });
    expect(sendInviteLetter).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/team/invite -- revoking", () => {
  const GOOD = { invite: INVITE, reason: "Sent it to the wrong address entirely." };

  it("revokes the invite and answers with nothing but ok", async () => {
    const response = await DELETE(request("DELETE", GOOD));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(revokeTeamInvite).toHaveBeenCalledWith(INVITE, GOOD.reason, "production");
  });

  // Revoking is not resending: no letter goes out, and the Owner's browser has nothing to send one
  // with either.
  it("sends no letter at all", async () => {
    await DELETE(request("DELETE", GOOD));
    expect(sendInviteLetter).not.toHaveBeenCalled();
  });

  it("requires an Owner, not merely a member", async () => {
    await DELETE(request("DELETE", GOOD));
    expect(requireConsoleMember).toHaveBeenCalledWith("owner");
  });

  it("refuses a cross-site request before it reaches the database", async () => {
    const response = await DELETE(request("DELETE", GOOD, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(revokeTeamInvite).not.toHaveBeenCalled();
  });

  it("refuses an invite id that is not a uuid", async () => {
    const response = await DELETE(request("DELETE", { ...GOOD, invite: "priya@trakline.in" }));
    expect(response.status).toBe(400);
    expect(revokeTeamInvite).not.toHaveBeenCalled();
  });

  // tapReason, the shared schema -- the same one /api/tap/options trimmed and digested at mint. A
  // reason the schema refuses never reaches the database, where console.use_tap would re-digest it.
  it("refuses a reason the shared tapReason schema refuses", async () => {
    const response = await DELETE(request("DELETE", { ...GOOD, reason: "too short" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Add a reason of at least 10 characters." });
    expect(revokeTeamInvite).not.toHaveBeenCalled();
  });

  it("refuses a body carrying anything else", async () => {
    const response = await DELETE(request("DELETE", { ...GOOD, email: "priya@trakline.in" }));
    expect(response.status).toBe(400);
    expect(revokeTeamInvite).not.toHaveBeenCalled();
  });

  it("passes a refusal through with the words the mapper chose, never the database's own", async () => {
    const message = "That confirmation no longer matches this invite. Try again.";
    revokeTeamInvite.mockRejectedValue(new AppError("INVALID_INPUT", message, { status: 403 }));
    const response = await DELETE(request("DELETE", GOOD));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ message });
  });
});
