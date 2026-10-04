import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const { requireConsoleMember, addBusinessLead, markBusinessLead, moveBusinessLead, assignBusinessLead, unmarkBusinessLead, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  addBusinessLead: vi.fn(),
  markBusinessLead: vi.fn(),
  moveBusinessLead: vi.fn(),
  assignBusinessLead: vi.fn(),
  unmarkBusinessLead: vi.fn(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
vi.mock("@/console/availability", () => ({ assertConsoleAvailable: () => {} }));
vi.mock("@/console/auth/db", () => ({ createConsoleDb: async () => ({ rpc: vi.fn() }), createConsoleServiceDb: () => ({ rpc: vi.fn() }) }));
vi.mock("@/console/leads/business-leads", () => ({ addBusinessLead, markBusinessLead, moveBusinessLead, assignBusinessLead, unmarkBusinessLead }));

import { POST as add } from "@/app/console/api/leads/business/add/route";
import { POST as assign } from "@/app/console/api/leads/business/assign/route";
import { POST as mark } from "@/app/console/api/leads/business/mark/route";
import { POST as move } from "@/app/console/api/leads/business/move/route";
import { POST as remove } from "@/app/console/api/leads/business/remove/route";

// ---------------------------------------------------------------------------
// The business pipeline's five routes. None needs a key; each carries the
// Support floor and the same-origin check. What a member typed is trimmed and
// bounded here, in the form's own words, and scrubbed by the database.
// ---------------------------------------------------------------------------

const SUPPORT: ConsoleMember = { userId: "33333333-3333-4333-8333-333333333333", email: "kiran@trakline.in", name: "Kiran Das", role: "support", status: "active" };
const ID = "p:a1111111-1111-4111-8111-111111111111";
const OWNER = "33333333-3333-4333-8333-333333333333";
const ENTRY = { stage: "new", stageSince: "2026-09-17T05:50:00+00:00", ownerId: OWNER, ownerName: "Kiran Das", name: "Meera Pillai", organisation: "Acme Travel", about: "Travel desk" };
const m = consoleMessages.leads;

function post(path: string, body: unknown, origin = "https://admin.trakline.in"): Request {
  return new Request(`https://admin.trakline.in${path}`, { method: "POST", headers: { "content-type": "application/json", host: "admin.trakline.in", origin }, body: JSON.stringify(body) });
}

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(SUPPORT);
  addBusinessLead.mockReset().mockResolvedValue({ id: ID, added: true });
  markBusinessLead.mockReset().mockResolvedValue(ENTRY);
  moveBusinessLead.mockReset().mockResolvedValue({ ...ENTRY, stage: "won" });
  assignBusinessLead.mockReset().mockResolvedValue(ENTRY);
  unmarkBusinessLead.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/leads/business/add", () => {
  const BODY = { email: "  Meera.Pillai@Acme-Travel.example ", name: " Meera Pillai ", organisation: "", about: " Travel desk ", owner: OWNER };

  it("adds under the server's environment with the Support floor, and answers the lead without echoing the address", async () => {
    const response = await add(post("/api/leads/business/add", BODY));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: true, id: ID, added: true });
    expect(text.toLowerCase()).not.toContain("meera.pillai@");
    expect(addBusinessLead).toHaveBeenCalledWith(expect.anything(), "production", { email: "meera.pillai@acme-travel.example", name: "Meera Pillai", organisation: "", about: "Travel desk", owner: OWNER });
    expect(requireConsoleMember).toHaveBeenCalledWith("support");
    expect(response.headers.get("cache-control") ?? "").toMatch(/no-store/);
  });

  it.each([
    [{ ...BODY, email: "meera" }, m.errors.notAddress],
    [{ ...BODY, about: "   " }, m.business.errors.aboutEmpty],
    [{ ...BODY, about: "a".repeat(121) }, m.business.errors.aboutLong],
    [{ ...BODY, name: "a".repeat(81) }, m.business.errors.nameLong],
    [{ ...BODY, organisation: "a".repeat(81) }, m.business.errors.nameLong],
  ])("refuses %j in the form's own words, before asking the database", async (body, shown) => {
    const response = await add(post("/api/leads/business/add", body));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(shown);
    expect(addBusinessLead).not.toHaveBeenCalled();
  });

  it("refuses an owner that is not an id, a field nobody asked for, and another origin", async () => {
    expect((await add(post("/api/leads/business/add", { ...BODY, owner: "Kiran" }))).status).toBe(400);
    expect((await add(post("/api/leads/business/add", { ...BODY, stage: "won" }))).status).toBe(400);
    expect((await add(post("/api/leads/business/add", BODY, "https://evil.example"))).status).toBe(403);
    expect(addBusinessLead).not.toHaveBeenCalled();
  });

  it("says a console member's address is not a lead, where the member can read it", async () => {
    addBusinessLead.mockRejectedValueOnce(new AppError("INVALID_INPUT", m.business.errors.member));
    const response = await add(post("/api/leads/business/add", BODY));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(m.business.errors.member);
  });
});

describe("POST /api/leads/business/mark", () => {
  it("marks the lead by id and answers its pipeline entry", async () => {
    const response = await mark(post("/api/leads/business/mark", { id: ID, name: "", organisation: "", about: "Travel desk", owner: OWNER }));
    expect(await response.json()).toEqual({ ok: true, business: ENTRY });
    expect(markBusinessLead).toHaveBeenCalledWith(expect.anything(), "production", ID, { name: "", organisation: "", about: "Travel desk", owner: OWNER });
    expect(requireConsoleMember).toHaveBeenCalledWith("support");
  });

  it("refuses an id that is not a lead's, and an empty line about it", async () => {
    expect((await mark(post("/api/leads/business/mark", { id: "42", name: "", organisation: "", about: "Travel desk", owner: OWNER }))).status).toBe(400);
    expect((await mark(post("/api/leads/business/mark", { id: ID, name: "", organisation: "", about: "", owner: OWNER }))).status).toBe(400);
    expect(markBusinessLead).not.toHaveBeenCalled();
  });
});

describe("POST /api/leads/business/move, assign and remove", () => {
  it("moves a lead to one of the five stages, and refuses any other", async () => {
    expect(await (await move(post("/api/leads/business/move", { id: ID, stage: "won" }))).json()).toEqual({ ok: true, business: { ...ENTRY, stage: "won" } });
    expect(moveBusinessLead).toHaveBeenCalledWith(expect.anything(), "production", ID, "won");
    expect((await move(post("/api/leads/business/move", { id: ID, stage: "maybe" }))).status).toBe(400);
    expect(moveBusinessLead).toHaveBeenCalledTimes(1);
  });

  it("gives a lead to an owner by id", async () => {
    expect(await (await assign(post("/api/leads/business/assign", { id: ID, owner: OWNER }))).json()).toEqual({ ok: true, business: ENTRY });
    expect(assignBusinessLead).toHaveBeenCalledWith(expect.anything(), "production", ID, OWNER);
    expect((await assign(post("/api/leads/business/assign", { id: ID, owner: "Kiran" }))).status).toBe(400);
  });

  it("removes a lead from the pipeline", async () => {
    expect(await (await remove(post("/api/leads/business/remove", { id: ID }))).json()).toEqual({ ok: true });
    expect(unmarkBusinessLead).toHaveBeenCalledWith(expect.anything(), "production", ID);
  });

  it("holds each to the Support floor and to this origin", async () => {
    for (const [route, path, body] of [[move, "move", { id: ID, stage: "won" }], [assign, "assign", { id: ID, owner: OWNER }], [remove, "remove", { id: ID }]] as const) {
      requireConsoleMember.mockClear();
      expect((await route(post(`/api/leads/business/${path}`, body, "https://evil.example"))).status, path).toBe(403);
      await route(post(`/api/leads/business/${path}`, body));
      expect(requireConsoleMember, path).toHaveBeenCalledWith("support");
    }
  });

  it("says a lead is no longer in the pipeline, where the member can read it", async () => {
    moveBusinessLead.mockRejectedValueOnce(new AppError("INVALID_INPUT", m.business.errors.notIn));
    const response = await move(post("/api/leads/business/move", { id: ID, stage: "won" }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(m.business.errors.notIn);
  });
});
