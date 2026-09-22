import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember, ConsoleRole } from "@/console/auth/member";
import { AppError } from "@/services/errors";

// vi.mock's factory is hoisted above every import and above any ordinary top-level `const`, so the
// mocks it returns come from vi.hoisted and are typed explicitly -- vi.fn(() => …) would infer a
// zero-argument signature (the same note tests/integration/console/team.test.ts carries).
const { requireConsoleMember, changeMemberRole, removeTeamMember, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  changeMemberRole: vi.fn<(member: string, role: ConsoleRole, reason: string, environment: string) => Promise<void>>(),
  removeTeamMember: vi.fn<(member: string, reason: string, environment: string) => Promise<void>>(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/team/team", () => ({ changeMemberRole, removeTeamMember }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));

import { DELETE, PATCH } from "@/app/console/api/team/member/route";

const URL_ = "http://admin.localhost:4210/console/api/team/member";

function patch(body: unknown, headers: Record<string, string | null> = {}): Request {
  const finalHeaders: Record<string, string> = {
    "content-type": "application/json",
    "sec-fetch-site": "same-origin",
    host: "admin.localhost:4210",
  };
  for (const [key, value] of Object.entries(headers)) {
    if (value === null) delete finalHeaders[key];
    else finalHeaders[key] = value;
  }
  return new Request(URL_, { method: "PATCH", headers: finalHeaders, body: JSON.stringify(body) });
}

const OWNER: ConsoleMember = {
  userId: "aaaaaaaa-0000-0000-0000-000000000001",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
};

const MEMBER = "d1111111-1111-1111-1111-111111111111";
const GOOD = { member: MEMBER, role: "admin", reason: "Covering switches for the weekend on-call." };

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(OWNER);
  changeMemberRole.mockReset().mockResolvedValue();
  removeTeamMember.mockReset().mockResolvedValue();
  consoleEnvironment.mockReset().mockReturnValue("production");
});

describe("PATCH /api/team/member", () => {
  it("changes the role, passing the member's id, the new role, the reason and the environment", async () => {
    const response = await PATCH(patch(GOOD));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(changeMemberRole).toHaveBeenCalledWith(MEMBER, "admin", GOOD.reason, "production");
  });

  it("requires an Owner, not merely a member", async () => {
    await PATCH(patch(GOOD));
    expect(requireConsoleMember).toHaveBeenCalledWith("owner");
  });

  it("refuses a cross-site request before it reaches the database", async () => {
    const response = await PATCH(patch(GOOD, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(changeMemberRole).not.toHaveBeenCalled();
  });

  // The tap is minted over the member's id as text and the database re-digests `p_member::text`,
  // so an id that is not a uuid could never have matched anything (task-5-addendum.md §4). It is a
  // shape complaint here, not a 500 carrying Postgres's own words about an invalid input syntax.
  it("refuses a member id that is not a uuid", async () => {
    const response = await PATCH(patch({ ...GOOD, member: "kiran@trakline.in" }));
    expect(response.status).toBe(400);
    expect(changeMemberRole).not.toHaveBeenCalled();
  });

  it("refuses a role that is not a role", async () => {
    const response = await PATCH(patch({ ...GOOD, role: "superadmin" }));
    expect(response.status).toBe(400);
    expect(changeMemberRole).not.toHaveBeenCalled();
  });

  // tapReason, the shared schema -- the same one /api/tap/options trimmed and digested at mint.
  it("refuses a reason the shared tapReason schema refuses", async () => {
    const response = await PATCH(patch({ ...GOOD, reason: "too short" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Add a reason of at least 10 characters." });
    expect(changeMemberRole).not.toHaveBeenCalled();
  });

  it("refuses a body carrying anything else", async () => {
    const response = await PATCH(patch({ ...GOOD, environment: "development" }));
    expect(response.status).toBe(400);
    expect(changeMemberRole).not.toHaveBeenCalled();
  });

  it("passes a refusal through with the words the mapper chose, never the database's own", async () => {
    changeMemberRole.mockRejectedValue(
      new AppError("INVALID_INPUT", "That confirmation no longer matches this change. Try again.", { status: 403 }),
    );
    const response = await PATCH(patch(GOOD));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ message: "That confirmation no longer matches this change. Try again." });
  });
});

// The DELETE half (task-6), shaped on the PATCH above. No role in the body: removal takes the
// member and a reason and nothing else, and the target's current role -- which the tap is minted
// over -- is the database's to read, never a caller's to assert.
describe("DELETE /api/team/member", () => {
  function del(body: unknown, headers: Record<string, string | null> = {}): Request {
    const finalHeaders: Record<string, string> = {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      host: "admin.localhost:4210",
    };
    for (const [key, value] of Object.entries(headers)) {
      if (value === null) delete finalHeaders[key];
      else finalHeaders[key] = value;
    }
    return new Request(URL_, { method: "DELETE", headers: finalHeaders, body: JSON.stringify(body) });
  }

  const GOOD_DELETE = { member: MEMBER, reason: "Left the support rota at the end of September." };

  it("removes the member, passing their id, the reason and the environment", async () => {
    const response = await DELETE(del(GOOD_DELETE));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(removeTeamMember).toHaveBeenCalledWith(MEMBER, GOOD_DELETE.reason, "production");
  });

  it("requires an Owner, not merely a member", async () => {
    await DELETE(del(GOOD_DELETE));
    expect(requireConsoleMember).toHaveBeenCalledWith("owner");
  });

  it("refuses a cross-site request before it reaches the database", async () => {
    const response = await DELETE(del(GOOD_DELETE, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(removeTeamMember).not.toHaveBeenCalled();
  });

  it("refuses a member id that is not a uuid", async () => {
    const response = await DELETE(del({ ...GOOD_DELETE, member: "kiran@trakline.in" }));
    expect(response.status).toBe(400);
    expect(removeTeamMember).not.toHaveBeenCalled();
  });

  it("refuses a reason the shared tapReason schema refuses", async () => {
    const response = await DELETE(del({ ...GOOD_DELETE, reason: "too short" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Add a reason of at least 10 characters." });
    expect(removeTeamMember).not.toHaveBeenCalled();
  });

  // `p_environment` in particular is the server's to decide, never a caller's -- and neither is the
  // role the tap was minted over.
  it("refuses a body carrying anything else", async () => {
    const response = await DELETE(del({ ...GOOD_DELETE, role: "viewer" }));
    expect(response.status).toBe(400);
    expect(removeTeamMember).not.toHaveBeenCalled();
  });

  it("passes a refusal through with the words the mapper chose, never the database's own", async () => {
    removeTeamMember.mockRejectedValue(new AppError("INVALID_INPUT", "The team has changed since this page loaded. Reload it and try again.", { status: 403 }));
    const response = await DELETE(del(GOOD_DELETE));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ message: "The team has changed since this page loaded. Reload it and try again." });
  });
});
