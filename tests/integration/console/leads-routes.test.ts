import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const { requireConsoleMember, findLead, revealLead, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  findLead: vi.fn<(db: unknown, environment: string, email: string) => Promise<unknown>>(),
  revealLead: vi.fn<(db: unknown, environment: string, id: string) => Promise<string>>(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
vi.mock("@/console/availability", () => ({ assertConsoleAvailable: () => {} }));
vi.mock("@/console/auth/db", () => ({ createConsoleDb: async () => ({ rpc: vi.fn() }), createConsoleServiceDb: () => ({ rpc: vi.fn() }) }));
vi.mock("@/console/leads/leads", async (original) => ({ ...(await original<typeof import("@/console/leads/leads")>()), findLead, revealLead }));

import { POST as find } from "@/app/console/api/leads/find/route";
import { POST as reveal } from "@/app/console/api/leads/reveal/route";

// ---------------------------------------------------------------------------
// Module 06's two routes. Both are POSTs, though neither changes a lead: each
// writes an audit row every time, and an address must never sit in a URL or a
// cache. Both carry the Support floor and the same-origin check.
// ---------------------------------------------------------------------------

const SUPPORT: ConsoleMember = { userId: "a0000000-0000-4000-8000-000000000001", email: "kiran@trakline.in", name: "Kiran Das", role: "support", status: "active" };
const ID = "p:a1111111-1111-4111-8111-111111111111";
const ROW = { id: ID, email: "a•••@example.com", news: "subscribed", availability: false, account: "has", source: "footer", campaign: null, firstSeen: "2026-09-02T04:44:00+00:00", lastActivity: "2026-09-18T15:42:00+00:00" };
const m = consoleMessages.leads;

function post(path: string, body: unknown, origin = "https://admin.trakline.in"): Request {
  return new Request(`https://admin.trakline.in${path}`, { method: "POST", headers: { "content-type": "application/json", host: "admin.trakline.in", origin }, body: JSON.stringify(body) });
}

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(SUPPORT);
  findLead.mockReset().mockResolvedValue(ROW);
  revealLead.mockReset().mockResolvedValue("asha.verma@example.com");
});

describe("POST /api/leads/find", () => {
  it("answers the masked row, under the server's environment, with the Support floor", async () => {
    const response = await find(post("/api/leads/find", { email: "asha.verma@example.com" }));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: true, lead: ROW });
    expect(text, "the answer never echoes the address that was searched for").not.toContain("asha.verma@example.com");
    expect(findLead).toHaveBeenCalledWith(expect.anything(), "production", "asha.verma@example.com");
    expect(requireConsoleMember).toHaveBeenCalledWith("support");
    expect(response.headers.get("cache-control") ?? "").toMatch(/no-store/);
  });

  it("answers null when nobody has that address", async () => {
    findLead.mockResolvedValueOnce(null);
    expect(await (await find(post("/api/leads/find", { email: "nobody@example.com" }))).json()).toEqual({ ok: true, lead: null });
  });

  it("refuses something that is not a whole address, before asking the database", async () => {
    const response = await find(post("/api/leads/find", { email: "asha" }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(m.errors.notAddress);
    expect(findLead).not.toHaveBeenCalled();
  });

  it("refuses a field nobody asked for, and another origin", async () => {
    expect((await find(post("/api/leads/find", { email: "a@example.com", environment: "preview" }))).status).toBe(400);
    expect((await find(post("/api/leads/find", { email: "a@example.com" }, "https://evil.example"))).status).toBe(403);
    expect(findLead).not.toHaveBeenCalled();
  });
});

describe("POST /api/leads/reveal", () => {
  it("answers the address, uncached, with the Support floor", async () => {
    const response = await reveal(post("/api/leads/reveal", { id: ID }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, address: "asha.verma@example.com" });
    expect(revealLead).toHaveBeenCalledWith(expect.anything(), "production", ID);
    expect(requireConsoleMember).toHaveBeenCalledWith("support");
    expect(response.headers.get("cache-control") ?? "").toMatch(/no-store/);
  });

  it("refuses an id that is not a lead's, and another origin", async () => {
    expect((await reveal(post("/api/leads/reveal", { id: "42" }))).status).toBe(400);
    expect((await reveal(post("/api/leads/reveal", { id: ID }, "https://evil.example"))).status).toBe(403);
    expect(revealLead).not.toHaveBeenCalled();
  });

  it("answers a lead that is gone as not found", async () => {
    revealLead.mockRejectedValueOnce(new AppError("NOT_FOUND", m.errors.gone));
    const response = await reveal(post("/api/leads/reveal", { id: ID }));
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).toContain(m.errors.gone);
  });
});
