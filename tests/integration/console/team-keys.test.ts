import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";
import { AppError } from "@/services/errors";

// DELETE /api/team/keys -- an Owner resetting another member's keys (task-6). Shaped exactly on
// tests/integration/console/team-member.test.ts: vi.mock's factory is hoisted above every import
// and above any ordinary top-level `const`, so the mocks it returns come from vi.hoisted and are
// typed explicitly -- vi.fn(() => …) would infer a zero-argument signature.
const { requireConsoleMember, resetMemberKeys, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  resetMemberKeys: vi.fn<(member: string, reason: string, environment: string) => Promise<number>>(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/team/team", () => ({ resetMemberKeys }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));

import { DELETE } from "@/app/console/api/team/keys/route";

const URL_ = "http://admin.localhost:4210/console/api/team/keys";

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

const OWNER: ConsoleMember = {
  userId: "aaaaaaaa-0000-0000-0000-000000000001",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
};

const MEMBER = "d1111111-1111-1111-1111-111111111111";
const GOOD = { member: MEMBER, reason: "Lost a security key on the train." };

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(OWNER);
  resetMemberKeys.mockReset().mockResolvedValue(2);
  consoleEnvironment.mockReset().mockReturnValue("production");
});

describe("DELETE /api/team/keys", () => {
  // The count is console_reset_keys' own return value, carried out so the browser can say how many
  // keys went (task-6-brief.md). Unlike the invite's token, a count is not a credential -- it is
  // the same number console_team already puts on the page.
  it("resets the keys and reports how many went", async () => {
    const response = await DELETE(del(GOOD));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, count: 2 });
    expect(resetMemberKeys).toHaveBeenCalledWith(MEMBER, GOOD.reason, "production");
  });

  it("reports whatever count the database returned, never a fixed two", async () => {
    resetMemberKeys.mockResolvedValue(3);
    const response = await DELETE(del(GOOD));
    expect(await response.json()).toEqual({ ok: true, count: 3 });
  });

  it("requires an Owner, not merely a member", async () => {
    await DELETE(del(GOOD));
    expect(requireConsoleMember).toHaveBeenCalledWith("owner");
  });

  it("refuses a cross-site request before it reaches the database", async () => {
    const response = await DELETE(del(GOOD, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(resetMemberKeys).not.toHaveBeenCalled();
  });

  // The tap is minted over the member's id as text and the database re-digests `p_member::text`,
  // so an id that is not a uuid could never have matched anything. A shape complaint here, not a
  // 500 carrying Postgres's own words about invalid input syntax.
  it("refuses a member id that is not a uuid", async () => {
    const response = await DELETE(del({ ...GOOD, member: "kiran@trakline.in" }));
    expect(response.status).toBe(400);
    expect(resetMemberKeys).not.toHaveBeenCalled();
  });

  it("refuses a reason the shared tapReason schema refuses", async () => {
    const response = await DELETE(del({ ...GOOD, reason: "too short" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Add a reason of at least 10 characters." });
    expect(resetMemberKeys).not.toHaveBeenCalled();
  });

  // There is no third field this action takes -- the key count in particular is the database's to
  // count inside its own transaction, never a caller's to assert -- and `p_environment` is the
  // server's to decide.
  it("refuses a body carrying anything else", async () => {
    const response = await DELETE(del({ ...GOOD, count: 2 }));
    expect(response.status).toBe(400);
    expect(resetMemberKeys).not.toHaveBeenCalled();
  });

  it("passes a refusal through with the words the mapper chose, never the database's own", async () => {
    const message = "That confirmation no longer matches this member's keys. Their keys changed since this page loaded; reload it and try again.";
    resetMemberKeys.mockRejectedValue(new AppError("INVALID_INPUT", message, { status: 403 }));
    const response = await DELETE(del(GOOD));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ message });
  });
});
