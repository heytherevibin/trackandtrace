import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const { requireConsoleMember, tagLead, untagLead, noteLead, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  tagLead: vi.fn<(db: unknown, environment: string, id: string, tag: string) => Promise<readonly string[]>>(),
  untagLead: vi.fn<(db: unknown, environment: string, id: string, tag: string) => Promise<readonly string[]>>(),
  noteLead: vi.fn<(db: unknown, environment: string, id: string, body: string) => Promise<readonly unknown[]>>(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
vi.mock("@/console/availability", () => ({ assertConsoleAvailable: () => {} }));
vi.mock("@/console/auth/db", () => ({ createConsoleDb: async () => ({ rpc: vi.fn() }), createConsoleServiceDb: () => ({ rpc: vi.fn() }) }));
vi.mock("@/console/leads/leads", async (original) => ({ ...(await original<typeof import("@/console/leads/leads")>()), tagLead, untagLead, noteLead }));

import { POST as note } from "@/app/console/api/leads/note/route";
import { POST as tag } from "@/app/console/api/leads/tag/route";
import { POST as untag } from "@/app/console/api/leads/untag/route";

// ---------------------------------------------------------------------------
// Module 06's three writing routes: add a tag, remove a tag, add a note. None
// needs a key (the brief: "Notes, tags … None (logged)"); each carries the
// Support floor and the same-origin check, and each answers what the lead
// holds now, as the database stored it.
// ---------------------------------------------------------------------------

const SUPPORT: ConsoleMember = { userId: "a0000000-0000-4000-8000-000000000001", email: "kiran@trakline.in", name: "Kiran Das", role: "support", status: "active" };
const ID = "p:a1111111-1111-4111-8111-111111111111";
const NOTES = [{ id: "b1111111-1111-4111-8111-111111111111", author: "Kiran Das", at: "2026-09-12T11:10:00+00:00", body: "Wrote from [removed]." }];
const m = consoleMessages.leads.errors;

function post(path: string, body: unknown, origin = "https://admin.trakline.in"): Request {
  return new Request(`https://admin.trakline.in${path}`, { method: "POST", headers: { "content-type": "application/json", host: "admin.trakline.in", origin }, body: JSON.stringify(body) });
}

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(SUPPORT);
  tagLead.mockReset().mockResolvedValue(["press", "travel-desk"]);
  untagLead.mockReset().mockResolvedValue(["travel-desk"]);
  noteLead.mockReset().mockResolvedValue(NOTES);
});

describe("POST /api/leads/tag", () => {
  it("adds the tag, lowered and trimmed, under the server's environment, and answers the lead's tags", async () => {
    const response = await tag(post("/api/leads/tag", { id: ID, tag: "  Press " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, tags: ["press", "travel-desk"] });
    expect(tagLead).toHaveBeenCalledWith(expect.anything(), "production", ID, "press");
    expect(requireConsoleMember).toHaveBeenCalledWith("support");
    expect(response.headers.get("cache-control") ?? "").toMatch(/no-store/);
  });

  it.each([["two words"], ["-press"], ["a".repeat(25)], [""]])("refuses %j in the form's own words, before asking the database", async (bad) => {
    const response = await tag(post("/api/leads/tag", { id: ID, tag: bad }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(m.notTag);
    expect(tagLead).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a lead's, a field nobody asked for, and another origin", async () => {
    expect((await tag(post("/api/leads/tag", { id: "42", tag: "press" }))).status).toBe(400);
    expect((await tag(post("/api/leads/tag", { id: ID, tag: "press", environment: "preview" }))).status).toBe(400);
    expect((await tag(post("/api/leads/tag", { id: ID, tag: "press" }, "https://evil.example"))).status).toBe(403);
    expect(tagLead).not.toHaveBeenCalled();
  });

  it("says why an eleventh tag was refused, where the member can read it", async () => {
    tagLead.mockRejectedValueOnce(new AppError("INVALID_INPUT", m.tooManyTags));
    const response = await tag(post("/api/leads/tag", { id: ID, tag: "press" }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(m.tooManyTags);
  });
});

describe("POST /api/leads/untag", () => {
  it("removes the tag and answers what is left", async () => {
    const response = await untag(post("/api/leads/untag", { id: ID, tag: "press" }));
    expect(await response.json()).toEqual({ ok: true, tags: ["travel-desk"] });
    expect(untagLead).toHaveBeenCalledWith(expect.anything(), "production", ID, "press");
    expect(requireConsoleMember).toHaveBeenCalledWith("support");
  });

  it("refuses another origin", async () => {
    expect((await untag(post("/api/leads/untag", { id: ID, tag: "press" }, "https://evil.example"))).status).toBe(403);
    expect(untagLead).not.toHaveBeenCalled();
  });
});

describe("POST /api/leads/note", () => {
  it("adds the note as typed, and answers the notes as the database stored them", async () => {
    const response = await note(post("/api/leads/note", { id: ID, body: "  Wrote from someone@example.com.  " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, notes: NOTES });
    expect(noteLead).toHaveBeenCalledWith(expect.anything(), "production", ID, "Wrote from someone@example.com.");
    expect(requireConsoleMember).toHaveBeenCalledWith("support");
    expect(response.headers.get("cache-control") ?? "").toMatch(/no-store/);
  });

  it("refuses an empty note and one over 500 characters, each in its own words, before asking the database", async () => {
    const empty = await note(post("/api/leads/note", { id: ID, body: "   " }));
    expect(empty.status).toBe(400);
    expect(JSON.stringify(await empty.json())).toContain(m.emptyNote);
    const long = await note(post("/api/leads/note", { id: ID, body: "a".repeat(501) }));
    expect(long.status).toBe(400);
    expect(JSON.stringify(await long.json())).toContain(m.noteTooLong);
    expect(noteLead).not.toHaveBeenCalled();
  });

  it("answers a lead that is gone as not found", async () => {
    noteLead.mockRejectedValueOnce(new AppError("NOT_FOUND", m.gone));
    expect((await note(post("/api/leads/note", { id: ID, body: "A note" }))).status).toBe(404);
  });
});
