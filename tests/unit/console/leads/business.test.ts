import { describe, expect, it, vi } from "vitest";
import type { ConsoleDb } from "@/console/auth/db";
import { BUSINESS_STAGES, daysInStage, initialsOf } from "@/console/leads/business";
import { addBusinessLead, assignBusinessLead, markBusinessLead, moveBusinessLead, readBusinessMembers, unmarkBusinessLead } from "@/console/leads/business-leads";
import { readLead } from "@/console/leads/leads";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

// ---------------------------------------------------------------------------
// Business leads: the console's calls over the pipeline
// (20261008090000_console_business_leads.sql), and the two small readings a
// card makes of one. None of the calls needs a key; the database records each.
// ---------------------------------------------------------------------------

const m = consoleMessages.leads;
const ID = "p:a1111111-1111-4111-8111-111111111111";
const KIRAN = "33333333-3333-4333-8333-333333333333";
const ENTRY = { stage: "new", stageSince: "2026-09-17T05:50:00+00:00", ownerId: KIRAN, ownerName: "Kiran Das", name: "Meera Pillai", organisation: "Acme Travel", about: "Travel desk, about 40 bookings a month" };

function db(answer: { data?: unknown; error?: { message: string } | null }): { db: ConsoleDb; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async () => ({ data: answer.data ?? null, error: answer.error ?? null }));
  return { db: { rpc } as unknown as ConsoleDb, rpc };
}

async function message(run: Promise<unknown>): Promise<string> {
  const err = await run.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).message;
}

describe("what a card reads", () => {
  it("has five stages, in the board's order", () => {
    expect(BUSINESS_STAGES).toEqual(["new", "contacted", "qualified", "won", "lost"]);
  });

  it("draws an owner as initials: the first letter of the first and last name", () => {
    expect(initialsOf("Kiran Das")).toBe("KD");
    expect(initialsOf("  asha   rao ")).toBe("AR");
    expect(initialsOf("Rohan Kumar Iyer")).toBe("RI");
    expect(initialsOf("Meera")).toBe("M");
    expect(initialsOf("")).toBe("");
  });

  it("counts whole days in a stage, and never below zero", () => {
    const now = new Date("2026-09-19T09:02:00Z");
    expect(daysInStage("2026-09-19T03:00:00+00:00", now)).toBe(0);
    expect(daysInStage("2026-09-17T09:00:00+00:00", now)).toBe(2);
    expect(daysInStage("2026-08-29T09:02:00+00:00", now)).toBe(21);
    expect(daysInStage("2026-09-20T09:00:00+00:00", now)).toBe(0);
  });
});

describe("the calls", () => {
  it("reads who may own a lead", async () => {
    const { db: client, rpc } = db({ data: [{ id: KIRAN, name: "Kiran Das" }] });
    expect(await readBusinessMembers(client)).toEqual([{ id: KIRAN, name: "Kiran Das" }]);
    expect(rpc).toHaveBeenCalledWith("console_business_members");
  });

  it("adds a lead by hand, and answers which lead it is and whether it was new", async () => {
    const { db: client, rpc } = db({ data: { id: ID, added: true } });
    expect(await addBusinessLead(client, "production", { email: "meera.pillai@acme-travel.example", name: "Meera Pillai", organisation: "", about: "Travel desk", owner: KIRAN })).toEqual({ id: ID, added: true });
    expect(rpc).toHaveBeenCalledWith("console_add_business_lead", { p_environment: "production", p_email: "meera.pillai@acme-travel.example", p_name: "Meera Pillai", p_organisation: "", p_about: "Travel desk", p_owner: KIRAN });
  });

  it("marks, moves, assigns and removes by the lead's id, each answering the entry as it now stands", async () => {
    const marked = db({ data: ENTRY });
    expect(await markBusinessLead(marked.db, "production", ID, { name: "", organisation: "", about: "Travel desk", owner: KIRAN })).toEqual(ENTRY);
    expect(marked.rpc).toHaveBeenCalledWith("console_mark_business_lead", { p_environment: "production", p_id: ID, p_name: "", p_organisation: "", p_about: "Travel desk", p_owner: KIRAN });
    const moved = db({ data: { ...ENTRY, stage: "won" } });
    expect((await moveBusinessLead(moved.db, "production", ID, "won")).stage).toBe("won");
    expect(moved.rpc).toHaveBeenCalledWith("console_move_business_lead", { p_environment: "production", p_id: ID, p_stage: "won" });
    const given = db({ data: { ...ENTRY, ownerName: null, ownerId: null } });
    expect((await assignBusinessLead(given.db, "production", ID, KIRAN)).ownerName).toBeNull();
    expect(given.rpc).toHaveBeenCalledWith("console_assign_business_lead", { p_environment: "production", p_id: ID, p_owner: KIRAN });
    const removed = db({ data: null });
    await unmarkBusinessLead(removed.db, "production", ID);
    expect(removed.rpc).toHaveBeenCalledWith("console_unmark_business_lead", { p_environment: "production", p_id: ID });
  });

  it.each([
    ["not an address", m.errors.notAddress],
    ["a console member", m.business.errors.member],
    ["about is empty", m.business.errors.aboutEmpty],
    ["about too long", m.business.errors.aboutLong],
    ["name too long", m.business.errors.nameLong],
    ["not an owner", m.business.errors.notOwner],
    ["already in the pipeline", m.business.errors.already],
    ["not in the pipeline", m.business.errors.notIn],
    ["unknown stage", m.errors.database],
    ["no such lead", m.errors.gone],
    ["no access", m.errors.noAccess],
    ["connection refused", m.errors.database],
  ])("turns the database's %j into the console's words", async (raised, shown) => {
    expect(await message(moveBusinessLead(db({ error: { message: raised } }).db, "production", ID, "won"))).toBe(shown);
  });

  it("refuses an entry of the wrong shape rather than drawing it", async () => {
    expect(await message(moveBusinessLead(db({ data: { ...ENTRY, stage: "maybe" } }).db, "production", ID, "won"))).toBe(m.errors.database);
  });
});

describe("the record", () => {
  const DETAIL = {
    id: ID, email: "m•••@acme-travel.example", firstSeen: "2026-09-17T05:50:00+00:00", consents: [], account: null, campaign: null,
    timeline: [{ at: "2026-09-17T05:50:00+00:00", kind: "added_by_hand", list: null, source: null, subject: null, reason: null, by: "Kiran Das" }],
    tags: [], notes: [], business: ENTRY,
  };

  it("carries the pipeline entry, and who added a lead by hand", async () => {
    const lead = await readLead(db({ data: DETAIL }).db, ID);
    expect(lead?.business).toEqual(ENTRY);
    expect(lead?.timeline[0]).toMatchObject({ kind: "added_by_hand", by: "Kiran Das" });
  });

  it("reads a lead that is not in the pipeline, and a record written before there was one", async () => {
    expect((await readLead(db({ data: { ...DETAIL, business: null } }).db, ID))?.business).toBeNull();
    const older = Object.fromEntries(Object.entries(DETAIL).filter(([key]) => key !== "business"));
    expect((await readLead(db({ data: older }).db, ID))?.business).toBeNull();
  });
});
