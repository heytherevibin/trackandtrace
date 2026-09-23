import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEntryDetail, AuditPage, AuditQuery } from "@/console/audit/audit";
import type { ConsoleMember } from "@/console/auth/member";
import { AppError } from "@/services/errors";

// vi.mock's factory is hoisted above every import and above any ordinary top-level `const`, so the
// mocks it returns are declared with vi.hoisted and typed explicitly (the same note
// tests/integration/console/team.test.ts carries).
const { requireConsoleMember, getAuditLog, getAuditEntry, writeConsoleAudit, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  getAuditLog: vi.fn<(query: AuditQuery) => Promise<AuditPage>>(),
  getAuditEntry: vi.fn<(id: string) => Promise<AuditEntryDetail | null>>(),
  writeConsoleAudit: vi.fn<() => Promise<void>>(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/audit/audit", async (importOriginal) => ({ ...(await importOriginal<object>()), getAuditLog, getAuditEntry }));
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

const ENTRY: AuditEntryDetail = {
  id: "5a000000-0000-4000-8000-000000000013",
  at: "2019-03-14T14:02:31.256374+00:00",
  environment: "production",
  actorId: OWNER.userId,
  actorName: "Asha Rao",
  actorRole: "owner",
  keyId: "f0000000-0000-4000-8000-00000000000f",
  keyName: "YubiKey 5C",
  sessionLabel: "Chrome on macOS",
  category: "configure",
  action: "Paused PNR checks",
  target: "PNR checks",
  reason: "Provider maintenance window, 14:00-15:00 IST.",
  result: "done",
  addressHash: "a3f9…c2c1",
  before: { pnr_checks: "on" },
  after: { pnr_checks: "paused" },
};

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(OWNER);
  getAuditLog.mockReset().mockResolvedValue(EMPTY);
  getAuditEntry.mockReset().mockResolvedValue(ENTRY);
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

// One entry, for the drawer. The same route rather than one of its own: same resource, same role
// floor, same "writes nothing" rule -- and the brief's own file list (task-3-brief.md) names this
// route and no other.
describe("GET /api/audit?id=", () => {
  it("answers with the one entry, and never reads a page as well", async () => {
    const response = await GET(get(`?id=${ENTRY.id}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, entry: ENTRY });
    expect(getAuditEntry).toHaveBeenCalledExactlyOnceWith(ENTRY.id);
    expect(getAuditLog).not.toHaveBeenCalled();
  });

  // console_audit_entry answers SQL NULL for an id that is not there -- not an error and not a
  // refusal (task-3-addendum.md §3), so neither is this. The drawer says "no such entry"; a 404
  // would make the client translate a status into the same sentence for no gain.
  it("answers an id that is not there with a null entry and a 200, not an error", async () => {
    getAuditEntry.mockResolvedValue(null);
    const response = await GET(get("?id=00000000-0000-4000-8000-00000000dead"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, entry: null });
  });

  // Validated at the boundary: a p_id that is not a uuid raises a raw 22P02 "invalid input syntax
  // for type uuid" at PostgREST, and that developer string has no business reaching a member. It
  // is also not a different answer -- there is no entry with that id either way.
  it("never hands the database an id that is not a uuid", async () => {
    const response = await GET(get("?id=not-a-uuid"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, entry: null });
    expect(getAuditEntry).not.toHaveBeenCalled();
  });

  it("carries the module's role floor here too", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("INVALID_INPUT", "You don't have access to this.", { status: 403 }));
    const response = await GET(get(`?id=${ENTRY.id}`));
    expect(response.status).toBe(403);
    expect(getAuditEntry).not.toHaveBeenCalled();
  });

  // The audit log is append-only and this phase adds exactly one writer, the page's own "Opened the
  // log" row. Opening a drawer is not opening the log.
  it("writes no audit row of its own, however often a drawer is opened", async () => {
    await GET(get(`?id=${ENTRY.id}`));
    await GET(get(`?id=${ENTRY.id}`));
    expect(writeConsoleAudit).not.toHaveBeenCalled();
  });

  it("answers a failed entry read with the console's own sentence and a 503", async () => {
    getAuditEntry.mockRejectedValue(new AppError("SOURCE_UNAVAILABLE", "The console could not be reached. Try again.", { status: 503 }));
    const response = await GET(get(`?id=${ENTRY.id}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ message: "The console could not be reached. Try again." });
  });
});
