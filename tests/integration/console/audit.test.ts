import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditPage, AuditQuery } from "@/console/audit/audit";
import type { ConsoleMember } from "@/console/auth/member";
import { AppError } from "@/services/errors";

// vi.mock's factory is hoisted above every import and above any ordinary top-level `const`, so the
// mocks it returns are declared with vi.hoisted and typed explicitly (the same note
// tests/integration/console/team.test.ts carries).
const { requireConsoleMember, getAuditLog, writeConsoleAudit, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  getAuditLog: vi.fn<(query: AuditQuery) => Promise<AuditPage>>(),
  writeConsoleAudit: vi.fn<() => Promise<void>>(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/audit/audit", async (importOriginal) => ({ ...(await importOriginal<object>()), getAuditLog }));
vi.mock("@/console/auth/audit", () => ({ writeConsoleAudit }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
vi.mock("@/console/availability", () => ({ assertConsoleAvailable: () => {} }));
// A service client that works, deliberately. Without it, a route that started writing an audit row
// would die on `createConsoleServiceDb()` (no SUPABASE_SECRET_KEY under vitest) and the assertion
// below would pass for the wrong reason -- found by breaking it on purpose (task-2-report.md).
vi.mock("@/console/auth/db", () => ({ createConsoleServiceDb: () => ({ rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) }) }));

import { GET } from "@/app/console/api/audit/route";

const OWNER: ConsoleMember = { userId: "a0000000-0000-4000-8000-000000000001", email: "asha@trakline.in", name: "Asha Rao", role: "owner", status: "active" };
const EMPTY: AuditPage = { rows: [], total: 0 };

function get(search = ""): Request {
  return new Request(`http://admin.localhost:4210/console/api/audit${search}`, { method: "GET", headers: { host: "admin.localhost:4210" } });
}

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(OWNER);
  getAuditLog.mockReset().mockResolvedValue(EMPTY);
  writeConsoleAudit.mockReset().mockResolvedValue();
  consoleEnvironment.mockReset().mockReturnValue("production");
});

describe("GET /api/audit", () => {
  it("answers with the page and the size of the filtered set", async () => {
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, rows: [], total: 0 });
  });

  // console.require_role('admin') is a floor: Owner and Admin pass, Support and Viewer are refused.
  // Unlike the page beside it, this route carries the floor itself -- it has no frame to render a
  // no-access state in, so it answers 403 (task-2-addendum.md §6).
  it("requires the module's own role floor, not merely a member", async () => {
    await GET(get());
    expect(requireConsoleMember).toHaveBeenCalledWith("admin");
  });

  it("refuses a role below the floor with the console's own words", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("INVALID_INPUT", "You don't have access to this.", { status: 403 }));
    const response = await GET(get());
    expect(response.status).toBe(403);
    expect(getAuditLog).not.toHaveBeenCalled();
  });

  it("reads the filters out of the query string", async () => {
    await GET(get("?range=7d&result=refused&category=messages&q=%20pnr%20&page=2"));
    expect(getAuditLog).toHaveBeenCalledWith(expect.objectContaining({ result: "refused", category: "messages", search: "pnr", offset: 50 }));
  });

  // task-2-addendum.md §3: '' on p_category / p_result / p_environment means "match nothing", so a
  // filter a member cleared must arrive as null and never as the empty string the form field held.
  it("turns a cleared filter into null, never an empty string", async () => {
    await GET(get("?result=&category=&member=&q="));
    const query = getAuditLog.mock.calls[0]?.[0];
    expect(query).toMatchObject({ result: null, category: null, member: null, search: null });
  });

  it("defaults the environment to this deployment's own, and lets the member clear it", async () => {
    await GET(get());
    expect(getAuditLog.mock.calls[0]?.[0]?.environment).toBe("production");
    await GET(get("?env=all"));
    expect(getAuditLog.mock.calls[1]?.[0]?.environment).toBeNull();
  });

  // Ruling (task-2-addendum.md §5): the page writes one row per server render; this route, which the
  // client re-reads on every filter change and every page turn, writes none -- otherwise an Owner
  // scrolling their own log floods it and the signal drowns in its own noise.
  it("writes no audit row of its own, however often it is called", async () => {
    await GET(get("?page=2"));
    await GET(get("?page=3"));
    expect(writeConsoleAudit).not.toHaveBeenCalled();
  });

  it("answers a failed read with the console's own sentence and a 503", async () => {
    getAuditLog.mockRejectedValue(new AppError("SOURCE_UNAVAILABLE", "The console could not be reached. Try again.", { status: 503 }));
    const response = await GET(get());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ message: "The console could not be reached. Try again." });
  });
});
