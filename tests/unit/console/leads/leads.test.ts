import { describe, expect, it, vi } from "vitest";
import type { ConsoleDb } from "@/console/auth/db";
import { LEAD_PAGE_SIZE, leadQuery, parseLeadFilters, sinceFor } from "@/console/leads/filters";
import { findLead, readFigures, readLead, readLeads, revealLead } from "@/console/leads/leads";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

// ---------------------------------------------------------------------------
// The console's five calls over leads, and the filters the page's address
// carries. A searched address is NEVER one of those: it goes in a request body.
// ---------------------------------------------------------------------------

const m = consoleMessages.leads.errors;
const ID = "p:a1111111-1111-4111-8111-111111111111";
const ROW = { id: ID, email: "a•••@example.com", news: "subscribed", availability: false, account: "has", source: "footer", campaign: { source: "google", medium: "cpc", name: "diwali-2026" }, firstSeen: "2026-09-02T04:44:00+00:00", lastActivity: "2026-09-18T15:42:00+00:00" };
const FIGURES = { total: 1612, pending: 37, subscribed: 431, unsubscribed: 58, suppressed: 4, accounts: 1204, availability: 217 };
const DETAIL = {
  id: ID, email: "a•••@example.com", firstSeen: "2026-09-02T04:44:00+00:00",
  consents: [{ list: "news", status: "subscribed", source: "footer", noticeVersion: "1.1", consentedAt: "2026-09-02T04:44:00+00:00", confirmedAt: "2026-09-02T04:50:00+00:00", withdrawnAt: null, withdrawReason: null }],
  account: { createdAt: "2026-09-05T04:00:00+00:00", lastSignInAt: "2026-09-18T15:42:00+00:00", disabled: false, emailLink: true, google: false, passkeys: 1, savedPnrs: 3 },
  campaign: { source: "google", medium: "cpc", name: "diwali-2026", firstPage: "/pre-booking" },
  timeline: [{ at: "2026-09-18T15:42:00+00:00", kind: "signed_in", list: null, source: null, subject: null, reason: null }],
};

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
    const page = await readLeads(client, { news: "subscribed", account: null, source: null, seen: "30d", page: 2, lead: null }, now);
    expect(page).toEqual({ total: 1, rows: [ROW] });
    expect(rpc).toHaveBeenCalledWith("console_leads", { p_news: "subscribed", p_since: "2026-08-20T09:02:00.000Z", p_limit: LEAD_PAGE_SIZE, p_offset: LEAD_PAGE_SIZE });
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

describe("the filters in the page's address", () => {
  it("reads the four filters, the page and the open lead, and drops anything it does not know", () => {
    expect(parseLeadFilters({ news: "pending", account: "has", source: "pre-booking", seen: "7d", page: "3", lead: ID })).toEqual({ news: "pending", account: "has", source: "pre-booking", seen: "7d", page: 3, lead: ID });
    expect(parseLeadFilters({ news: "everyone", account: "x", source: "billboard", seen: "forever", page: "-2", lead: "nope" })).toEqual({ news: null, account: null, source: null, seen: "any", page: 1, lead: null });
    expect(parseLeadFilters({ news: ["pending", "subscribed"] })).toMatchObject({ news: "pending" });
  });

  it("never reads an address: a searched email does not travel in the page's address", () => {
    expect(parseLeadFilters({ q: "asha.verma@example.com", email: "asha.verma@example.com" })).toEqual(parseLeadFilters({}));
  });

  it("writes only what differs from the defaults, so the plain page has a plain address", () => {
    expect(leadQuery(parseLeadFilters({}))).toBe("/leads");
    expect(leadQuery({ news: "pending", account: null, source: null, seen: "any", page: 1, lead: null })).toBe("/leads?news=pending");
    expect(leadQuery({ news: null, account: "has", source: "footer", seen: "30d", page: 2, lead: ID })).toBe(`/leads?account=has&source=footer&seen=30d&page=2&lead=${encodeURIComponent(ID)}`);
  });

  it("turns First seen into a moment, or none", () => {
    const now = new Date("2026-09-19T09:02:00Z");
    expect(sinceFor("any", now)).toBeNull();
    expect(sinceFor("7d", now)).toBe("2026-09-12T09:02:00.000Z");
    expect(sinceFor("90d", now)).toBe("2026-06-21T09:02:00.000Z");
  });
});
