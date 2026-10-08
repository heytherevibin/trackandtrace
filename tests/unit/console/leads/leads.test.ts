import { describe, expect, it, vi } from "vitest";
import type { ConsoleDb } from "@/console/auth/db";
import { LEAD_PAGE_SIZE, leadQuery, parseLeadFilters, sinceFor } from "@/console/leads/filters";
import { deleteLead, exportLeads, findLead, noteLead, readFigures, readLead, readLeads, readTags, revealLead, tagLead, untagLead } from "@/console/leads/leads";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

// ---------------------------------------------------------------------------
// The console's five calls over leads, and the filters the page's address
// carries. A searched address is NEVER one of those: it goes in a request body.
// ---------------------------------------------------------------------------

const m = consoleMessages.leads.errors;
const ID = "p:a1111111-1111-4111-8111-111111111111";
const ROW = { id: ID, email: "a•••@example.com", news: "subscribed", availability: false, account: "has", source: "footer", campaign: { source: "google", medium: "cpc", name: "diwali-2026" }, tags: ["travel-desk"], firstSeen: "2026-09-02T04:44:00+00:00", lastActivity: "2026-09-18T15:42:00+00:00" };
const FIGURES = { total: 1612, pending: 37, subscribed: 431, unsubscribed: 58, suppressed: 4, accounts: 1204, availability: 217 };
const DETAIL = {
  id: ID, email: "a•••@example.com", firstSeen: "2026-09-02T04:44:00+00:00",
  consents: [{ list: "news", status: "subscribed", source: "footer", noticeVersion: "1.1", consentedAt: "2026-09-02T04:44:00+00:00", confirmedAt: "2026-09-02T04:50:00+00:00", withdrawnAt: null, withdrawReason: null }],
  account: { createdAt: "2026-09-05T04:00:00+00:00", lastSignInAt: "2026-09-18T15:42:00+00:00", disabled: false, emailLink: true, google: false, passkeys: 1, savedPnrs: 3 },
  campaign: { source: "google", medium: "cpc", name: "diwali-2026", firstPage: "/pre-booking" },
  timeline: [{ at: "2026-09-18T15:42:00+00:00", kind: "signed_in", list: null, source: null, subject: null, reason: null }],
  tags: ["travel-desk"],
  notes: [{ id: "b1111111-1111-4111-8111-111111111111", author: "Kiran Das", at: "2026-09-12T11:10:00+00:00", body: "Asked about group bookings. Wrote from [removed]." }],
  business: null,
};
const NOTES = DETAIL.notes;

function db(answer: { data?: unknown; error?: { message: string } | null }): { db: ConsoleDb; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async () => ({ data: answer.data ?? null, error: answer.error ?? null }));
  return { db: { rpc } as unknown as ConsoleDb, rpc };
}

async function message(run: Promise<unknown>): Promise<string> {
  const err = await run.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).message;
}

describe("reading", () => {
  it("returns the figures", async () => {
    const { db: client, rpc } = db({ data: FIGURES });
    expect(await readFigures(client)).toEqual(FIGURES);
    expect(rpc).toHaveBeenCalledWith("console_lead_figures");
  });

  it("asks for one page with the filters that are on, and leaves out each that is off", async () => {
    const { db: client, rpc } = db({ data: { total: 1, rows: [ROW] } });
    const now = new Date("2026-09-19T09:02:00Z");
    const page = await readLeads(client, { news: "subscribed", account: null, source: null, tag: "travel-desk", seen: "30d", page: 2, lead: null }, now);
    expect(page).toEqual({ total: 1, rows: [ROW] });
    expect(rpc).toHaveBeenCalledWith("console_leads", { p_news: "subscribed", p_tag: "travel-desk", p_since: "2026-08-20T09:02:00.000Z", p_limit: LEAD_PAGE_SIZE, p_offset: LEAD_PAGE_SIZE });
  });

  it("throws on a database error rather than answering no leads, and on a row of the wrong shape", async () => {
    const filters = parseLeadFilters({});
    expect(await message(readLeads(db({ error: { message: "connection refused" } }).db, filters, new Date()))).toBe(m.database);
    expect(await message(readLeads(db({ data: { total: 1, rows: [{ ...ROW, news: "maybe" }] } }).db, filters, new Date()))).toBe(m.database);
  });

  it("refuses a row that carries a whole address: only a masked one may reach the page", async () => {
    expect(await message(readLeads(db({ data: { total: 1, rows: [{ ...ROW, email: "asha.verma@example.com" }] } }).db, parseLeadFilters({}), new Date()))).toBe(m.database);
  });

  it("returns one record, and null when there is none", async () => {
    const one = db({ data: DETAIL });
    expect(await readLead(one.db, ID)).toEqual(DETAIL);
    expect(one.rpc).toHaveBeenCalledWith("console_lead", { p_id: ID });
    expect(await readLead(db({ data: null }).db, ID)).toBeNull();
  });
});

describe("reveal and find", () => {
  it("reveals by id under the server's environment", async () => {
    const { db: client, rpc } = db({ data: "asha.verma@example.com" });
    expect(await revealLead(client, "production", ID)).toBe("asha.verma@example.com");
    expect(rpc).toHaveBeenCalledWith("console_reveal_lead", { p_environment: "production", p_id: ID });
  });

  it("finds by the whole address, and answers null when nobody has it", async () => {
    const found = db({ data: ROW });
    expect(await findLead(found.db, "production", "asha.verma@example.com")).toEqual(ROW);
    expect(found.rpc).toHaveBeenCalledWith("console_find_lead", { p_environment: "production", p_email: "asha.verma@example.com" });
    expect(await findLead(db({ data: null }).db, "production", "nobody@example.com")).toBeNull();
  });

  it.each([
    ["no access", m.noAccess],
    ["no such lead", m.gone],
    ["not a lead id", m.gone],
    ["not an address", m.notAddress],
    ["unknown filter", m.database],
    ["something nobody planned for", m.database],
  ])("turns the database's %j into the console's words", async (raised, shown) => {
    expect(await message(revealLead(db({ error: { message: raised } }).db, "production", ID))).toBe(shown);
  });
});

describe("tags and notes", () => {
  it("reads every tag in use", async () => {
    const { db: client, rpc } = db({ data: ["beta", "press"] });
    expect(await readTags(client)).toEqual(["beta", "press"]);
    expect(rpc).toHaveBeenCalledWith("console_lead_tags");
  });

  it("adds and removes a tag by the lead's id, and answers the lead's tags", async () => {
    const added = db({ data: ["press", "travel-desk"] });
    expect(await tagLead(added.db, "production", ID, "press")).toEqual(["press", "travel-desk"]);
    expect(added.rpc).toHaveBeenCalledWith("console_tag_lead", { p_environment: "production", p_id: ID, p_tag: "press" });
    const removed = db({ data: ["travel-desk"] });
    expect(await untagLead(removed.db, "production", ID, "press")).toEqual(["travel-desk"]);
    expect(removed.rpc).toHaveBeenCalledWith("console_untag_lead", { p_environment: "production", p_id: ID, p_tag: "press" });
  });

  it("adds a note, and answers the lead's notes as the database stored them", async () => {
    const { db: client, rpc } = db({ data: NOTES });
    expect(await noteLead(client, "production", ID, "Asked about group bookings. Wrote from someone@example.com.")).toEqual(NOTES);
    expect(rpc).toHaveBeenCalledWith("console_note_lead", { p_environment: "production", p_id: ID, p_body: "Asked about group bookings. Wrote from someone@example.com." });
  });

  it.each([
    ["not a tag", m.notTag],
    ["too many tags", m.tooManyTags],
    ["empty note", m.emptyNote],
    ["note too long", m.noteTooLong],
    ["no such lead", m.gone],
    ["no access", m.noAccess],
  ])("turns the database's %j into the console's words", async (raised, shown) => {
    expect(await message(tagLead(db({ error: { message: raised } }).db, "production", ID, "press"))).toBe(shown);
  });
});

describe("delete and export", () => {
  const REASON = "Asked by phone to be removed from our lists.";
  const m2 = consoleMessages.leads;

  it("deletes by id, passing the tap's own value and reason through untouched", async () => {
    const { db: client, rpc } = db({ data: null });
    await deleteLead(client, "production", ID, '{"environment":"production"}', REASON);
    expect(rpc).toHaveBeenCalledWith("console_delete_lead", { p_environment: "production", p_id: ID, p_value: '{"environment":"production"}', p_reason: REASON });
  });

  it.each([
    ["no tap for this action", m2.confirm.tapMismatch],
    ["has an account", m2.remove.hasAccount],
    ["environment mismatch", m2.confirm.refused],
    ["no such lead", m.gone],
    ["no access", m.noAccess],
    ["connection refused", m.database],
  ])("turns the database's %j on a delete into the console's words", async (raised, shown) => {
    expect(await message(deleteLead(db({ error: { message: raised } }).db, "production", ID, "{}", REASON))).toBe(shown);
  });

  it("exports the filters verbatim, and answers the file, its name and how many rows it holds", async () => {
    const FILTERS = '{"account":null,"environment":"production","news":"subscribed","since":null,"source":null,"tag":null}';
    const row = { email: "asha.verma@example.com", news: "subscribed", availability: false, account: "has", source: "footer", campaignSource: null, campaignMedium: null, campaignName: null, tags: ["press"], firstSeen: "2026-09-02T04:44:00+00:00", lastActivity: "2026-09-18T15:42:00+00:00" };
    const { db: client, rpc } = db({ data: { rows: [row], count: 1 } });
    const file = await exportLeads(client, "production", FILTERS, REASON, new Date("2026-09-19T09:02:00Z"));
    expect(rpc).toHaveBeenCalledWith("console_export_leads", { p_environment: "production", p_filters: FILTERS, p_reason: REASON });
    expect(file.count).toBe(1);
    expect(file.fileName).toBe("leads-2026-09-19.csv");
    expect(file.csv.split("\r\n")[1]).toBe("asha.verma@example.com,subscribed,false,has,footer,,,,press,2026-09-02T04:44:00+00:00,2026-09-18T15:42:00+00:00");
  });

  it.each([
    ["no tap for this action", m2.confirm.tapMismatch],
    ["too many leads to export", m2.export.tooMany(10_000)],
    ["the export filters could not be read", m2.confirm.refused],
    ["environment mismatch", m2.confirm.refused],
    ["no access", m.noAccess],
    ["connection refused", m.database],
  ])("turns the database's %j on an export into the console's words", async (raised, shown) => {
    expect(await message(exportLeads(db({ error: { message: raised } }).db, "production", "{}", REASON, new Date()))).toBe(shown);
  });

  it("refuses an answer that is not rows of leads, rather than writing a file from it", async () => {
    expect(await message(exportLeads(db({ data: { rows: [{ email: 42 }], count: 1 } }).db, "production", "{}", REASON, new Date()))).toBe(m.database);
  });
});

describe("the filters in the page's address", () => {
  it("reads the five filters, the page and the open lead, and drops anything it does not know", () => {
    expect(parseLeadFilters({ news: "pending", account: "has", source: "pre-booking", tag: "travel-desk", seen: "7d", page: "3", lead: ID })).toEqual({ news: "pending", account: "has", source: "pre-booking", tag: "travel-desk", seen: "7d", page: 3, lead: ID });
    expect(parseLeadFilters({ news: "everyone", account: "x", source: "billboard", tag: "Two Words", seen: "forever", page: "-2", lead: "nope" })).toEqual({ news: null, account: null, source: null, tag: null, seen: "any", page: 1, lead: null });
    expect(parseLeadFilters({ news: ["pending", "subscribed"] })).toMatchObject({ news: "pending" });
  });

  it("never reads an address: a searched email does not travel in the page's address", () => {
    expect(parseLeadFilters({ q: "asha.verma@example.com", email: "asha.verma@example.com" })).toEqual(parseLeadFilters({}));
  });

  it("writes only what differs from the defaults, so the plain page has a plain address", () => {
    expect(leadQuery(parseLeadFilters({}))).toBe("/leads");
    expect(leadQuery({ news: "pending", account: null, source: null, tag: null, seen: "any", page: 1, lead: null })).toBe("/leads?news=pending");
    expect(leadQuery({ news: null, account: "has", source: "footer", tag: "travel-desk", seen: "30d", page: 2, lead: ID })).toBe(`/leads?account=has&source=footer&tag=travel-desk&seen=30d&page=2&lead=${encodeURIComponent(ID)}`);
  });

  it("turns First seen into a moment, or none", () => {
    const now = new Date("2026-09-19T09:02:00Z");
    expect(sinceFor("any", now)).toBeNull();
    expect(sinceFor("7d", now)).toBe("2026-09-12T09:02:00.000Z");
    expect(sinceFor("90d", now)).toBe("2026-06-21T09:02:00.000Z");
  });
});
