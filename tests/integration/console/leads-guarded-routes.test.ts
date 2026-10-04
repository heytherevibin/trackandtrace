import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const { requireConsoleMember, deleteLead, exportLeads, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  deleteLead: vi.fn<(db: unknown, environment: string, id: string, value: string, reason: string) => Promise<void>>(),
  exportLeads: vi.fn<(db: unknown, environment: string, filters: string, reason: string, now: Date) => Promise<{ csv: string; count: number; fileName: string }>>(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
vi.mock("@/console/availability", () => ({ assertConsoleAvailable: () => {} }));
vi.mock("@/console/auth/db", () => ({ createConsoleDb: async () => ({ rpc: vi.fn() }), createConsoleServiceDb: () => ({ rpc: vi.fn() }) }));
vi.mock("@/console/leads/leads", async (original) => ({ ...(await original<typeof import("@/console/leads/leads")>()), deleteLead, exportLeads }));

import { POST as remove } from "@/app/console/api/leads/delete/route";
import { POST as exportRoute } from "@/app/console/api/leads/export/route";

// ---------------------------------------------------------------------------
// Module 06's two routes behind a reason and a key. Neither spends the tap:
// the database does, re-digesting the very strings these routes pass through.
// So the one thing a route must never do is reshape them.
// ---------------------------------------------------------------------------

const ADMIN: ConsoleMember = { userId: "a0000000-0000-4000-8000-000000000001", email: "rohan@trakline.in", name: "Rohan Iyer", role: "admin", status: "active" };
const ID = "p:a1111111-1111-4111-8111-111111111111";
const REASON = "Asked by phone to be removed from our lists.";
const VALUE = '{"environment":"production"}';
const FILTERS = '{"account":null,"environment":"production","news":"subscribed","since":null,"source":null,"tag":null}';
const m = consoleMessages;

function post(path: string, body: unknown, origin = "https://admin.trakline.in"): Request {
  return new Request(`https://admin.trakline.in${path}`, { method: "POST", headers: { "content-type": "application/json", host: "admin.trakline.in", origin }, body: JSON.stringify(body) });
}

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(ADMIN);
  deleteLead.mockReset().mockResolvedValue(undefined);
  exportLeads.mockReset().mockResolvedValue({ csv: "﻿email\r\nasha.verma@example.com", count: 1, fileName: "leads-2026-09-19.csv" });
});

describe("POST /api/leads/delete", () => {
  it("passes the id, the value and the reason through as the tap was minted over them, with the Support floor", async () => {
    const response = await remove(post("/api/leads/delete", { id: ID, value: VALUE, reason: REASON }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(deleteLead).toHaveBeenCalledWith(expect.anything(), "production", ID, VALUE, REASON);
    expect(requireConsoleMember).toHaveBeenCalledWith("support");
  });

  it("refuses a reason too short to be one, in the dialog's own words, before asking the database", async () => {
    const response = await remove(post("/api/leads/delete", { id: ID, value: VALUE, reason: "no" }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(m.tap.reasonShort);
    expect(deleteLead).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a lead's, a field nobody asked for, and another origin", async () => {
    expect((await remove(post("/api/leads/delete", { id: "42", value: VALUE, reason: REASON }))).status).toBe(400);
    expect((await remove(post("/api/leads/delete", { id: ID, value: VALUE, reason: REASON, environment: "preview" }))).status).toBe(400);
    expect((await remove(post("/api/leads/delete", { id: ID, value: VALUE, reason: REASON }, "https://evil.example"))).status).toBe(403);
    expect(deleteLead).not.toHaveBeenCalled();
  });

  it("says a lead with an account cannot be deleted here, where the member can read it", async () => {
    deleteLead.mockRejectedValueOnce(new AppError("INVALID_INPUT", m.leads.remove.hasAccount));
    const response = await remove(post("/api/leads/delete", { id: ID, value: VALUE, reason: REASON }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(m.leads.remove.hasAccount);
  });
});

describe("POST /api/leads/export", () => {
  it("passes the filters and the reason through verbatim, with the Admin floor, and answers the file uncached", async () => {
    const response = await exportRoute(post("/api/leads/export", { filters: FILTERS, reason: REASON }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, csv: "﻿email\r\nasha.verma@example.com", count: 1, fileName: "leads-2026-09-19.csv" });
    expect(exportLeads).toHaveBeenCalledWith(expect.anything(), "production", FILTERS, REASON, expect.any(Date));
    expect(requireConsoleMember).toHaveBeenCalledWith("admin");
    expect(response.headers.get("cache-control") ?? "").toMatch(/no-store/);
  });

  it.each([["not json"], ["[]"], ['"a string"'], ["x".repeat(2001)]])("refuses filters that are not an object (%j) before asking the database", async (filters) => {
    const response = await exportRoute(post("/api/leads/export", { filters, reason: REASON }));
    expect(response.status).toBe(400);
    expect(exportLeads).not.toHaveBeenCalled();
  });

  it("refuses a short reason, a field nobody asked for, and another origin", async () => {
    expect((await exportRoute(post("/api/leads/export", { filters: FILTERS, reason: "no" }))).status).toBe(400);
    expect((await exportRoute(post("/api/leads/export", { filters: FILTERS, reason: REASON, environment: "preview" }))).status).toBe(400);
    expect((await exportRoute(post("/api/leads/export", { filters: FILTERS, reason: REASON }, "https://evil.example"))).status).toBe(403);
    expect(exportLeads).not.toHaveBeenCalled();
  });
});
