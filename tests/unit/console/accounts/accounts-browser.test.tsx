import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountDetail, AccountRow } from "@/console/accounts/accounts";
import { NO_ACCOUNT_FILTERS, parseAccountFilters } from "@/console/accounts/filters";
import { consoleMessages } from "@/console/messages";

const { push, refresh, requestFindAccount, requestRevealAccount, success, error } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), requestFindAccount: vi.fn(), requestRevealAccount: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/console/accounts/accounts-client", () => ({ requestFindAccount, requestRevealAccount }));
vi.mock("@/components/ui/toast", () => ({ notify: { success, error } }));

import { AccountsBrowser } from "@/console/accounts/accounts-browser";

// ---------------------------------------------------------------------------
// ConsoleAccounts.dc.html and ConsoleAccountsPhone.dc.html (sheet 24). The
// sheet's rules: every address is masked until revealed; a saved PNR is never
// shown, only how many; a search takes the whole address and stays masked.
// ---------------------------------------------------------------------------

const m = consoleMessages.accounts;
const news = consoleMessages.leads.news;
const ASHA = "c1111111-1111-4111-8111-111111111111";
const KIRAN = "c3333333-3333-4333-8333-333333333333";
const LEAD = "p:a1111111-1111-4111-8111-111111111111";
const row = (over: Partial<AccountRow>): AccountRow => ({
  id: ASHA, email: "a•••@example.com", createdAt: "2026-09-05T04:00:00+00:00", lastSignInAt: "2026-09-18T15:42:00+00:00",
  emailLink: true, google: false, passkeys: 1, savedPnrs: 3, news: "subscribed", disabled: false, leadId: LEAD, ...over,
});
const ROWS = [
  row({}),
  row({ id: "c2222222-2222-4222-8222-222222222222", email: "d•••@example.com", emailLink: false, google: true, passkeys: 0, savedPnrs: 1, news: "none", leadId: "a:c2222222-2222-4222-8222-222222222222" }),
  row({ id: KIRAN, email: "k•••@example.com", passkeys: 2, savedPnrs: 0, disabled: true, lastSignInAt: null, leadId: `a:${KIRAN}` }),
];
const DETAIL: AccountDetail = { ...ROWS[0]!, sessions: { count: 2, lastSeenAt: "2026-09-19T02:35:00+00:00" } };

const browser = (over: Partial<Parameters<typeof AccountsBrowser>[0]> = {}) => render(<AccountsBrowser page={{ total: 3, rows: ROWS }} filters={NO_ACCOUNT_FILTERS} detail={null} {...over} />);
const table = () => screen.getByRole("table", { name: m.table.caption });
const tableRow = (text: string) => within(table()).getByRole("row", { name: new RegExp(text.replace(/[.•]/g, "\\$&")) });

beforeEach(() => {
  for (const fn of [push, refresh, requestFindAccount, requestRevealAccount, success, error]) fn.mockReset();
});

describe("the list", () => {
  it("draws each account masked, with how it signs in, a count of saved PNRs, News and Status", () => {
    browser();
    const asha = tableRow("a•••@example.com");
    expect(within(asha).getByRole("link", { name: m.table.open("a•••@example.com") })).toHaveAttribute("href", `/accounts?account=${ASHA}`);
    expect(within(asha).getByText("Email link · 1 passkey")).toBeInTheDocument();
    expect(within(asha).getByRole("cell", { name: "3" })).toBeInTheDocument();
    expect(within(asha).getByText(m.status.active)).toBeInTheDocument();
    expect(within(tableRow("d•••@example.com")).getByText("Google")).toBeInTheDocument();
    const kiran = tableRow("k•••@example.com");
    expect(within(kiran).getByText(m.status.disabled)).toBeInTheDocument();
    expect(within(kiran).getByText(m.table.never)).toBeInTheDocument();
  });

  it("makes the News tag a link to the same person in Leads", () => {
    browser();
    expect(within(tableRow("a•••@example.com")).getByRole("link", { name: m.table.openLead(news.subscribed, "a•••@example.com") })).toHaveAttribute("href", `/leads?lead=${encodeURIComponent(LEAD)}`);
    expect(within(tableRow("d•••@example.com")).getByRole("link", { name: m.table.openLead(news.none, "d•••@example.com") })).toHaveTextContent(news.none);
  });

  it("reveals an address on request, and then has nothing more to reveal on that row", async () => {
    requestRevealAccount.mockResolvedValue({ kind: "done", address: "asha.verma@example.com" });
    browser();
    await userEvent.click(within(tableRow("a•••@example.com")).getByRole("button", { name: m.table.revealLabel("a•••@example.com") }));
    expect(requestRevealAccount).toHaveBeenCalledWith(ASHA);
    expect(within(tableRow("asha.verma@example.com")).queryByRole("button", { name: /Reveal/ })).not.toBeInTheDocument();
  });

  it("says why a reveal failed and leaves the address masked", async () => {
    requestRevealAccount.mockResolvedValue({ kind: "failed", message: m.errors.database });
    browser();
    await userEvent.click(within(tableRow("a•••@example.com")).getByRole("button", { name: m.table.revealLabel("a•••@example.com") }));
    expect(error).toHaveBeenCalledWith(m.errors.database);
    expect(tableRow("a•••@example.com")).toBeInTheDocument();
  });

  it("draws the same accounts as cards for a phone, each one a single link to its record", () => {
    browser();
    const cards = screen.getByRole("list", { name: m.table.caption });
    expect(within(cards).getAllByRole("listitem")).toHaveLength(3);
    const card = within(cards).getByRole("link", { name: m.table.open("k•••@example.com") });
    expect(card).toHaveTextContent(m.status.disabled);
    expect(card).toHaveTextContent("Email link · 2 passkeys");
    expect(card).toHaveTextContent(m.table.savedLine(0, news.subscribed));
    expect(card).toHaveTextContent(/Created 0?5 Sept? 2026 · Never signed in/);
    // One link and nothing else to press: on a phone an address is revealed on the record.
    expect(within(cards).getAllByRole("link")).toHaveLength(3);
    expect(within(cards).queryByRole("button")).not.toBeInTheDocument();
  });

  it("says there are no accounts yet, or that the filters match nobody, or that the list could not be read", () => {
    const empty = browser({ page: { total: 0, rows: [] } });
    expect(screen.getByText(m.states.emptyTitle)).toBeInTheDocument();
    empty.unmount();
    const filtered = browser({ page: { total: 0, rows: [] }, filters: parseAccountFilters({ status: "disabled" }) });
    expect(screen.getByText(m.states.filteredTitle)).toBeInTheDocument();
    filtered.unmount();
    browser({ page: null });
    expect(screen.getByRole("alert")).toHaveTextContent(m.states.errorTitle);
    expect(screen.queryByText(m.states.emptyTitle)).not.toBeInTheDocument();
  });

  it("pages with links, and has none where there is nowhere to go", () => {
    const middle = browser({ page: { total: 120, rows: ROWS }, filters: parseAccountFilters({ page: "2", status: "active" }) });
    expect(screen.getAllByText("51–100 of 120").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: m.table.previous })).toHaveAttribute("href", "/accounts?status=active");
    expect(screen.getByRole("link", { name: m.table.next })).toHaveAttribute("href", "/accounts?status=active&page=3");
    middle.unmount();
    browser();
    expect(screen.queryByRole("link", { name: m.table.next })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.table.next })).toBeDisabled();
  });
});

describe("the filters", () => {
  it("writes a picked filter to the address, and goes back to the first page", async () => {
    browser({ filters: parseAccountFilters({ page: "3" }) });
    await userEvent.selectOptions(screen.getAllByLabelText(m.filters.status)[0]!, "disabled");
    expect(push).toHaveBeenCalledWith("/accounts?status=disabled");
    await userEvent.selectOptions(screen.getAllByLabelText(m.filters.method)[0]!, "passkey");
    expect(push).toHaveBeenCalledWith("/accounts?method=passkey");
    await userEvent.selectOptions(screen.getAllByLabelText(m.filters.created)[0]!, "30d");
    expect(push).toHaveBeenCalledWith("/accounts?created=30d");
  });

  it("offers Email link, Google and Passkey as ways to sign in", () => {
    browser();
    const picker = screen.getAllByLabelText(m.filters.method)[0] as HTMLSelectElement;
    expect(Array.from(picker.options).map((o) => o.textContent)).toEqual([m.filters.all, m.methods.email, m.methods.google, m.methods.passkey]);
  });
});

describe("search by full email", () => {
  const search = async (text: string) => {
    await userEvent.type(screen.getAllByRole("searchbox", { name: m.filters.search })[0]!, `${text}{Enter}`);
  };

  it("sends the whole address in a request, never to the page's address, and shows the match still masked", async () => {
    requestFindAccount.mockResolvedValue({ kind: "done", account: ROWS[0] });
    browser();
    await search("asha.verma@example.com");
    expect(requestFindAccount).toHaveBeenCalledWith("asha.verma@example.com");
    expect(push).not.toHaveBeenCalled();
    expect(within(table()).getAllByRole("row")).toHaveLength(2);
    expect(tableRow("a•••@example.com")).toBeInTheDocument();
    expect(screen.getAllByText(m.table.oneMatch).length).toBeGreaterThan(0);
    expect(screen.getByText(m.filters.exact)).toBeInTheDocument();
  });

  it("says no account has that address, and that the lookup was logged", async () => {
    requestFindAccount.mockResolvedValue({ kind: "done", account: null });
    browser();
    await search("nobody@example.com");
    expect(screen.getByText(m.states.noMatchTitle)).toBeInTheDocument();
    expect(screen.getByText(m.states.noMatchDetail)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("refuses part of an address in the form's own words, without a lookup", async () => {
    browser();
    await search("asha");
    expect(screen.getByRole("alert")).toHaveTextContent(m.errors.notAddress);
    expect(requestFindAccount).not.toHaveBeenCalled();
  });

  it("goes back to the whole list when the filter is cleared", async () => {
    requestFindAccount.mockResolvedValue({ kind: "done", account: ROWS[0] });
    browser();
    await search("asha.verma@example.com");
    await userEvent.click(screen.getByRole("button", { name: m.filters.clear }));
    expect(within(table()).getAllByRole("row")).toHaveLength(4);
    expect(screen.queryByText(m.filters.exact)).not.toBeInTheDocument();
  });

  it("shows why a lookup failed and leaves the list as it was", async () => {
    requestFindAccount.mockResolvedValue({ kind: "failed", message: m.errors.database });
    browser();
    await search("asha.verma@example.com");
    expect(error).toHaveBeenCalledWith(m.errors.database);
    expect(within(table()).getAllByRole("row")).toHaveLength(4);
  });
});

describe("the account's record", () => {
  const open = (detail: Parameters<typeof AccountsBrowser>[0]["detail"] = DETAIL, id = ASHA) => {
    browser({ detail, filters: parseAccountFilters({ account: id, status: "active" }) });
    return screen.getByRole("dialog", { name: m.record.title });
  };

  it("opens over the list with the status, the facts, the sessions and News", () => {
    const record = open();
    expect(within(record).getByText("a•••@example.com")).toBeInTheDocument();
    expect(within(record).getByText(/^Created 0?5 Sept? 2026$/)).toBeInTheDocument();
    expect(within(record).getByText(m.record.active)).toBeInTheDocument();
    expect(within(record).getByText(m.record.canSignIn)).toBeInTheDocument();
    expect(within(record).getByText("Email link · 1 passkey")).toBeInTheDocument();
    expect(within(record).getByText(m.record.savedPnrs).nextElementSibling).toHaveTextContent(/^3$/);
    expect(within(record).getByText(m.record.sessionCount(2))).toBeInTheDocument();
    expect(within(record).getByText(m.record.lastSeen).nextElementSibling).toHaveTextContent(/19 Sept? 2026.* IST$/);
    expect(within(record).getByText(news.subscribed)).toBeInTheDocument();
    expect(within(record).getByRole("link", { name: m.record.openLeadLabel("a•••@example.com") })).toHaveAttribute("href", `/leads?lead=${encodeURIComponent(LEAD)}`);
    expect(within(record).getByText(m.record.separate)).toBeInTheDocument();
    expect(within(record).getByText(m.record.private)).toBeInTheDocument();
  });

  it("says a disabled account can't sign in, and that nobody is signed in", () => {
    const record = open({ ...ROWS[2]!, sessions: { count: 0, lastSeenAt: null } }, KIRAN);
    expect(within(record).getByText(m.record.disabled)).toBeInTheDocument();
    expect(within(record).getByText(m.record.cannotSignIn)).toBeInTheDocument();
    expect(within(record).queryByText(m.record.canSignIn)).not.toBeInTheDocument();
    expect(within(record).getByText(m.record.nobody)).toBeInTheDocument();
    expect(within(record).getByText(m.record.lastSignIn).nextElementSibling).toHaveTextContent(m.table.never);
  });

  it("reveals the address in the record, says it was logged, and the row behind it follows", async () => {
    requestRevealAccount.mockResolvedValue({ kind: "done", address: "asha.verma@example.com" });
    const record = open();
    await userEvent.click(within(record).getByRole("button", { name: m.table.revealLabel("a•••@example.com") }));
    expect(requestRevealAccount).toHaveBeenCalledWith(ASHA);
    expect(within(record).getByText("asha.verma@example.com")).toBeInTheDocument();
    expect(within(record).getByText(m.record.revealed)).toBeInTheDocument();
    expect(within(record).queryByRole("button", { name: /Reveal/ })).not.toBeInTheDocument();
    expect(within(record).getByRole("link", { name: m.record.openLeadLabel("asha.verma@example.com") })).toBeInTheDocument();
  });

  it("lets a keyboard reach the record's scrolling part", () => {
    expect(within(open()).getByRole("region", { name: m.record.details })).toHaveAttribute("tabindex", "0");
  });

  it("closes to the same list, with the account gone from the address", async () => {
    await userEvent.click(within(open()).getByRole("button", { name: "Close" }));
    expect(push).toHaveBeenCalledWith("/accounts?status=active");
  });

  it("says a record could not be read, or is no longer there", () => {
    const failed = browser({ detail: "unavailable", filters: parseAccountFilters({ account: ASHA }) });
    expect(within(screen.getByRole("dialog", { name: m.record.title })).getByRole("alert")).toHaveTextContent(m.record.unavailable);
    failed.unmount();
    browser({ detail: "gone", filters: parseAccountFilters({ account: ASHA }) });
    expect(within(screen.getByRole("dialog", { name: m.record.title })).getByText(m.record.gone)).toBeInTheDocument();
  });

  it("never draws a saved PNR, only how many", () => {
    const record = open();
    expect(record.textContent).not.toMatch(/\d{10}/);
  });
});
