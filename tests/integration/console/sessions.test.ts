import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MySessionRow } from "@/console/account/my-sessions";
import type { ConsoleMember } from "@/console/auth/member";
import { AppError } from "@/services/errors";

// Same layering as tests/integration/console/my-keys.test.ts: the route handler is real, the
// account layer and the auth guard underneath it are faked.
const { requireConsoleMember, getMySessions, signOutOtherSessions, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<() => Promise<ConsoleMember>>(),
  getMySessions: vi.fn<() => Promise<readonly MySessionRow[]>>(),
  signOutOtherSessions: vi.fn<(environment: string) => Promise<number>>(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/account/my-sessions", () => ({ getMySessions, signOutOtherSessions }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));

import { DELETE, GET } from "@/app/console/api/sessions/route";

function del(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "DELETE", headers: { "sec-fetch-site": "same-origin", host: "admin.localhost:4210", ...headers } });
}

const SESSIONS_URL = "http://admin.localhost:4210/console/api/sessions";

const MEMBER: ConsoleMember = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
};

const ROWS: readonly MySessionRow[] = [
  { id: "cccccccc-0000-0000-0000-000000000001", deviceLabel: "Chrome on macOS", lastSeenAt: "2026-09-21T03:50:00Z", createdAt: "2026-09-21T03:42:00Z", isCurrent: true },
  { id: "cccccccc-0000-0000-0000-000000000002", deviceLabel: "Safari on iPhone", lastSeenAt: "2026-09-20T17:15:00Z", createdAt: "2026-09-18T17:10:00Z", isCurrent: false },
];

beforeEach(() => {
  requireConsoleMember.mockReset();
  getMySessions.mockReset();
  signOutOtherSessions.mockReset();
  consoleEnvironment.mockReset().mockReturnValue("production");
});

describe("GET /api/sessions", () => {
  it("returns the signed-in member's sessions", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    getMySessions.mockResolvedValue(ROWS);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, sessions: ROWS });
    expect(getMySessions).toHaveBeenCalledOnce();
  });

  it("never reaches console_my_sessions when there is no session", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("UNAUTHENTICATED", "Your session ended. Sign in again.", { status: 401 }));
    const response = await GET();
    expect(response.status).toBe(401);
    expect(getMySessions).not.toHaveBeenCalled();
  });

  it("answers a database fault with the shared unavailable shape, not a raw error", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    getMySessions.mockRejectedValue(new AppError("SOURCE_UNAVAILABLE", "The console could not be reached. Try again.", { status: 503 }));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });
});

describe("DELETE /api/sessions", () => {
  it("signs the other sessions out through the caller's own environment and reports the count", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    signOutOtherSessions.mockResolvedValue(2);
    const response = await DELETE(del(SESSIONS_URL));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, count: 2 });
    expect(signOutOtherSessions).toHaveBeenCalledExactlyOnceWith("production");
  });

  it("refuses a cross-site request before ever signing anything out", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    const response = await DELETE(del(SESSIONS_URL, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(signOutOtherSessions).not.toHaveBeenCalled();
  });

  it("never reaches console_sign_out_others when there is no session", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("UNAUTHENTICATED", "Your session ended. Sign in again.", { status: 401 }));
    const response = await DELETE(del(SESSIONS_URL));
    expect(response.status).toBe(401);
    expect(signOutOtherSessions).not.toHaveBeenCalled();
  });

  it("answers a database fault with the shared unavailable shape, not a raw error", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    signOutOtherSessions.mockRejectedValue(new AppError("SOURCE_UNAVAILABLE", "The console could not be reached. Try again.", { status: 503 }));
    const response = await DELETE(del(SESSIONS_URL));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });
});
