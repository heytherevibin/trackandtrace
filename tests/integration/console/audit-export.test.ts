import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditExport, AuditExportRequest } from "@/console/audit/audit";
import type { ConsoleMember } from "@/console/auth/member";
import { AppError } from "@/services/errors";

// vi.mock's factory is hoisted above every import and above any ordinary top-level `const`, so the
// mocks it returns are declared with vi.hoisted and typed explicitly (the same note
// tests/integration/console/audit.test.ts carries).
const { requireConsoleMember, exportAuditLog, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  exportAuditLog: vi.fn<(ask: AuditExportRequest) => Promise<AuditExport>>(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/audit/audit", async (importOriginal) => ({ ...(await importOriginal<object>()), exportAuditLog }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
vi.mock("@/console/availability", () => ({ assertConsoleAvailable: () => {} }));

import { POST } from "@/app/console/api/audit/export/route";

const OWNER: ConsoleMember = { userId: "a0000000-0000-4000-8000-000000000001", email: "asha@trakline.in", name: "Asha Rao", role: "owner", status: "active" };

const RANGE = "2026-09-18T18:30:00.000Z/2026-09-19T18:30:00.000Z";
const FILTERS = '{"category":null,"environment":"production","member":null,"result":null,"search":null}';
const REASON = "Monthly access review for September.";
const READY: AuditExport = { csv: "﻿id,at\r\n1,2", count: 14, fileName: "audit-2026-09-19.csv" };

function post(body: unknown, origin = "https://admin.trakline.in"): Request {
  return new Request("https://admin.trakline.in/console/api/audit/export", {
    method: "POST",
    headers: { "content-type": "application/json", host: "admin.trakline.in", origin },
    body: JSON.stringify(body),
  });
}

const GOOD = { range: RANGE, filters: FILTERS, reason: REASON };

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(OWNER);
  exportAuditLog.mockReset().mockResolvedValue(READY);
  consoleEnvironment.mockReset().mockReturnValue("production");
});

describe("POST /api/audit/export", () => {
  it("answers with the file, its name and its size", async () => {
    const response = await POST(post(GOOD));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, csv: READY.csv, count: 14, fileName: "audit-2026-09-19.csv" });
  });

  // The whole carriage. Nothing is stored anywhere: the bytes are in this one answer, to this one
  // request, and the browser that asked holds them and nothing else does. There is no second
  // endpoint to replay, because there is nothing left behind to replay against.
  it("is a no-store answer, so no proxy keeps a copy of the log", async () => {
    const response = await POST(post(GOOD));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  // The two canonical strings are the ones the tap was minted over, so the route passes them
  // through exactly as they arrived. Rebuilding them here would let a Today range cross midnight
  // between the mint and the spend and leave a tap that cannot be spent.
  it("hands the strings on verbatim, and decides the environment itself", async () => {
    await POST(post(GOOD));
    expect(exportAuditLog).toHaveBeenCalledWith({ range: RANGE, filters: FILTERS, reason: REASON, environment: "production" });
  });

  // console.require_role('admin') is a floor: Owner and Admin pass, Support and Viewer are refused.
  // Like the GET beside it, this route carries the floor itself -- a route has no frame to render a
  // no-access state in.
  it("requires the module's own role floor, not merely a member", async () => {
    await POST(post(GOOD));
    expect(requireConsoleMember).toHaveBeenCalledWith("admin");
  });

  it("refuses a role below the floor with the console's own words", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("INVALID_INPUT", "You don't have access to this.", { status: 403 }));
    const response = await POST(post(GOOD));
    expect(response.status).toBe(403);
    expect(exportAuditLog).not.toHaveBeenCalled();
  });

  // Every mutating console route carries this, and this one is mutating: it spends a tap and writes
  // an audit row.
  it("refuses a cross-origin request", async () => {
    const response = await POST(post(GOOD, "https://elsewhere.example"));
    expect(response.status).toBe(403);
    expect(exportAuditLog).not.toHaveBeenCalled();
  });

  // tapReason, imported and not restated: its trim decided the exact string console.action_digest
  // hashed at mint. A second schema that merely looked the same is how a reason with a trailing
  // space mints one digest and spends against another.
  it("trims the reason exactly as the mint did", async () => {
    await POST(post({ ...GOOD, reason: `  ${REASON}  ` }));
    expect(exportAuditLog).toHaveBeenCalledWith(expect.objectContaining({ reason: REASON }));
  });

  it("refuses a reason too short to be one", async () => {
    const response = await POST(post({ ...GOOD, reason: "no" }));
    expect(response.status).toBe(400);
    expect(exportAuditLog).not.toHaveBeenCalled();
  });

  // A range that is not the canonical shape never reaches the database: it would be refused there
  // too, but a shape complaint at the boundary is cheaper and cannot be mistaken for a refusal
  // about the member's access.
  it("refuses a range that is not one", async () => {
    for (const range of ["", "not-a-range", "a/b/c", `${RANGE}/`]) {
      exportAuditLog.mockClear();
      const response = await POST(post({ ...GOOD, range }));
      expect(response.status, range).toBe(400);
      expect(exportAuditLog).not.toHaveBeenCalled();
    }
  });

  it("refuses a filter blob that is not an object", async () => {
    for (const filters of ["", "null", "[]", '"x"']) {
      exportAuditLog.mockClear();
      const response = await POST(post({ ...GOOD, filters }));
      expect(response.status, filters).toBe(400);
      expect(exportAuditLog).not.toHaveBeenCalled();
    }
  });

  // No `environment` and no `count` in the body, and no fourth field of any kind: the deployment is
  // always the server's to decide, and the number of rows is the database's to discover. A caller
  // asserting either would be asserting a fact the server is about to establish for itself.
  it("takes three fields and no more", async () => {
    const response = await POST(post({ ...GOOD, environment: "preview" }));
    expect(response.status).toBe(400);
    expect(exportAuditLog).not.toHaveBeenCalled();
  });

  // A refusal from the database already carries this module's own copy -- the route adds none of
  // its own and swallows none.
  it("passes a refusal through with its status and its sentence", async () => {
    exportAuditLog.mockRejectedValue(new AppError("INVALID_INPUT", "That confirmation no longer matches this export. Try exporting again.", { status: 403 }));
    const response = await POST(post(GOOD));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ message: "That confirmation no longer matches this export. Try exporting again." });
  });
});
