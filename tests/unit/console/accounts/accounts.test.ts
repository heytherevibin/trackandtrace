import { describe, expect, it, vi } from "vitest";
import { findAccount, readAccount, readAccounts, revealAccount } from "@/console/accounts/accounts";
import { ACCOUNT_PAGE_SIZE, NO_ACCOUNT_FILTERS, accountQuery, hasAccountFilters, parseAccountFilters } from "@/console/accounts/filters";
import type { ConsoleDb } from "@/console/auth/db";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

// ---------------------------------------------------------------------------
// The console's four calls over traveller accounts, and the filters the page's
// address carries. A searched address is NEVER one of those: it goes in a
// request body. A saved PNR is never in an answer: only how many there are.
// ---------------------------------------------------------------------------

const m = consoleMessages.accounts.errors;
const ID = "c1111111-1111-4111-8111-111111111111";
const ROW = {
  id: ID, email: "a•••@example.com", createdAt: "2026-09-05T04:00:00+00:00", lastSignInAt: "2026-09-18T15:42:00+00:00",
  emailLink: true, google: false, passkeys: 1, savedPnrs: 3, news: "subscribed", disabled: false, leadId: "p:a1111111-1111-4111-8111-111111111111",
};
const DETAIL = { ...ROW, sessions: { count: 2, lastSeenAt: "2026-09-19T02:35:00+00:00" } };

function db(answer: { data?: unknown; error?: { message: string } | null }): { db: ConsoleDb; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async () => ({ data: answer.data ?? null, error: answer.error ?? null }));
  return { db: { rpc } as unknown as ConsoleDb, rpc };
}

async function message(run: Promise<unknown>): Promise<string> {
  const err = await run.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).message;
}

describe("the address's filters", () => {
  it("reads what the pickers wrote, and falls back to all for anything else", () => {
    expect(parseAccountFilters({ status: "disabled", method: "passkey", created: "30d", page: "3", account: ID })).toEqual({ status: "disabled", method: "passkey", created: "30d", page: 3, account: ID });
    expect(parseAccountFilters({ status: "deleted", method: "password", created: "ever", page: "0", account: "asha@example.com" })).toEqual(NO_ACCOUNT_FILTERS);
    expect(parseAccountFilters({})).toEqual(NO_ACCOUNT_FILTERS);
  });

  it("takes the first of a repeated key", () => {
    expect(parseAccountFilters({ status: ["active", "disabled"] }).status).toBe("active");
  });

  it("writes only what differs from the plain page", () => {
    expect(accountQuery(NO_ACCOUNT_FILTERS)).toBe("/accounts");
    expect(accountQuery({ status: "disabled", method: "google", created: "7d", page: 2, account: ID })).toBe(`/accounts?status=disabled&method=google&created=7d&page=2&account=${ID}`);
  });

  it("never writes an email: a record is named by the account's id", () => {
    expect(accountQuery({ ...NO_ACCOUNT_FILTERS, account: ID })).not.toContain("@");
  });

  it("knows whether a filter is on; the page and the open record are not filters", () => {
    expect(hasAccountFilters(NO_ACCOUNT_FILTERS)).toBe(false);
    expect(hasAccountFilters({ ...NO_ACCOUNT_FILTERS, page: 4, account: ID })).toBe(false);
    expect(hasAccountFilters({ ...NO_ACCOUNT_FILTERS, method: "email" })).toBe(true);
  });
});

describe("reading", () => {
  it("asks for one page with the filters that are on, and leaves out each that is off", async () => {
    const { db: client, rpc } = db({ data: { total: 1, rows: [ROW] } });
    const now = new Date("2026-09-19T09:02:00Z");
    expect(await readAccounts(client, { status: "active", method: null, created: "30d", page: 2, account: null }, now)).toEqual({ total: 1, rows: [ROW] });
    expect(rpc).toHaveBeenCalledWith("console_accounts", { p_status: "active", p_since: "2026-08-20T09:02:00.000Z", p_limit: ACCOUNT_PAGE_SIZE, p_offset: ACCOUNT_PAGE_SIZE });
  });

  it("asks for the first page of everyone when nothing is on", async () => {
    const { db: client, rpc } = db({ data: { total: 0, rows: [] } });
    await readAccounts(client, NO_ACCOUNT_FILTERS, new Date());
    expect(rpc).toHaveBeenCalledWith("console_accounts", { p_limit: ACCOUNT_PAGE_SIZE, p_offset: 0 });
  });

  it("throws on a database error rather than answering no accounts, and on a row of the wrong shape", async () => {
    expect(await message(readAccounts(db({ error: { message: "connection refused" } }).db, NO_ACCOUNT_FILTERS, new Date()))).toBe(m.database);
    expect(await message(readAccounts(db({ data: { total: 1, rows: [{ ...ROW, news: "maybe" }] } }).db, NO_ACCOUNT_FILTERS, new Date()))).toBe(m.database);
  });

  it("refuses a row that carries a whole address: only a masked one may reach the page", async () => {
    expect(await message(readAccounts(db({ data: { total: 1, rows: [{ ...ROW, email: "asha.verma@example.com" }] } }).db, NO_ACCOUNT_FILTERS, new Date()))).toBe(m.database);
  });

  it("refuses a row that carries anything beyond the count of saved PNRs", async () => {
    expect(await message(readAccounts(db({ data: { total: 1, rows: [{ ...ROW, pnrs: ["1234567890"] }] } }).db, NO_ACCOUNT_FILTERS, new Date()))).toBe(m.database);
  });

  it("takes an account that has never signed in", async () => {
    const never = { ...ROW, lastSignInAt: null };
    expect((await readAccounts(db({ data: { total: 1, rows: [never] } }).db, NO_ACCOUNT_FILTERS, new Date())).rows[0]?.lastSignInAt).toBeNull();
  });

  it("returns one record with its sessions, and null when there is none", async () => {
    const one = db({ data: DETAIL });
    expect(await readAccount(one.db, ID)).toEqual(DETAIL);
    expect(one.rpc).toHaveBeenCalledWith("console_account", { p_id: ID });
    expect(await readAccount(db({ data: null }).db, ID)).toBeNull();
    expect((await readAccount(db({ data: { ...DETAIL, sessions: { count: 0, lastSeenAt: null } } }).db, ID))?.sessions).toEqual({ count: 0, lastSeenAt: null });
  });

  it("takes a record that says since when an account has been disabled and by whom, and refuses any other key", async () => {
    const disabled = { ...DETAIL, disabled: true, disabledAt: "2026-09-18T10:35:00+00:00", disabledBy: "Asha Rao" };
    expect(await readAccount(db({ data: disabled }).db, ID)).toEqual(disabled);
    expect(await readAccount(db({ data: { ...DETAIL, disabledAt: null, disabledBy: null } }).db, ID)).toMatchObject({ disabledAt: null, disabledBy: null });
    expect(await message(readAccount(db({ data: { ...DETAIL, pnrs: ["1234567890"] } }).db, ID))).toBe(m.database);
  });
});

describe("reveal and find", () => {
  it("reveals by id under the server's environment", async () => {
    const { db: client, rpc } = db({ data: "asha.verma@example.com" });
    expect(await revealAccount(client, "production", ID)).toBe("asha.verma@example.com");
    expect(rpc).toHaveBeenCalledWith("console_reveal_account", { p_environment: "production", p_id: ID });
  });

  it("finds by the whole address, and answers null when nobody has it", async () => {
    const found = db({ data: ROW });
    expect(await findAccount(found.db, "production", "asha.verma@example.com")).toEqual(ROW);
    expect(found.rpc).toHaveBeenCalledWith("console_find_account", { p_environment: "production", p_email: "asha.verma@example.com" });
    expect(await findAccount(db({ data: null }).db, "production", "nobody@example.com")).toBeNull();
  });

  it.each([
    ["no access", m.noAccess],
    ["no such account", m.gone],
    ["not an address", m.notAddress],
    ["unknown filter", m.database],
    ["something nobody planned for", m.database],
  ])("turns the database's %j into the console's words", async (raised, shown) => {
    expect(await message(revealAccount(db({ error: { message: raised } }).db, "production", ID))).toBe(shown);
  });

  it("answers a refused role with 403 and a missing account with not found", async () => {
    const refused = await revealAccount(db({ error: { message: "no access" } }).db, "production", ID).then(() => null, (e: unknown) => e);
    expect((refused as AppError).status).toBe(403);
    const gone = await revealAccount(db({ error: { message: "no such account" } }).db, "production", ID).then(() => null, (e: unknown) => e);
    expect((gone as AppError).code).toBe("NOT_FOUND");
  });
});
