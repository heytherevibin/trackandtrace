import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseLeadFilters } from "@/console/leads/filters";
import type { LeadDetail, LeadRow } from "@/console/leads/leads";
import { consoleMessages } from "@/console/messages";

const { push, refresh, requestFind, requestReveal, requestTag, requestNote, success, error } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), requestFind: vi.fn(), requestReveal: vi.fn(), requestTag: vi.fn(), requestNote: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/console/leads/leads-client", () => ({ requestFind, requestReveal, requestTag, requestNote }));
vi.mock("@/components/ui/toast", () => ({ notify: { success, error } }));

import { FiguresPlate } from "@/console/leads/figures-plate";
import { LeadsBrowser } from "@/console/leads/leads-browser";
import { NewsTag } from "@/console/leads/news-tag";

// ---------------------------------------------------------------------------
// ConsoleLeads.dc.html and ConsoleLeadsPhone.dc.html (sheet 22). The sheet's
// rules: every address is masked until revealed; News and Account are separate
// columns; a search takes the whole address and its result stays masked.
// ---------------------------------------------------------------------------

const m = consoleMessages.leads;
const ASHA = "p:a1111111-1111-4111-8111-111111111111";
const row = (over: Partial<LeadRow>): LeadRow => ({ id: ASHA, email: "a•••@example.com", news: "subscribed", availability: false, account: "has", source: "footer", campaign: { source: "google", medium: "cpc", name: "diwali-2026" }, tags: [], firstSeen: "2026-09-02T04:44:00+00:00", lastActivity: "2026-09-18T15:42:00+00:00", ...over });
const ROWS = [
  row({ tags: ["travel-desk"] }),
  row({ id: "p:a2222222-2222-4222-8222-222222222222", email: "m•••@example.org", news: "pending", account: "none", source: "landing", campaign: null, tags: ["beta", "press", "vip"] }),
  row({ id: "a:c3333333-3333-4333-8333-333333333333", email: "d•••@example.com", news: "none", account: "disabled", source: "account", campaign: null, availability: true }),
];
const DETAIL: LeadDetail = {
  id: ASHA, email: "a•••@example.com", firstSeen: "2026-09-02T04:44:00+00:00",
  consents: [{ list: "news", status: "subscribed", source: "footer", noticeVersion: "1.1", consentedAt: "2026-09-02T04:44:00+00:00", confirmedAt: "2026-09-02T04:50:00+00:00", withdrawnAt: null, withdrawReason: null }],
  account: { createdAt: "2026-09-05T04:00:00+00:00", lastSignInAt: "2026-09-18T15:42:00+00:00", disabled: false, emailLink: true, google: false, passkeys: 1, savedPnrs: 3 },
  campaign: { source: "google", medium: "cpc", name: "diwali-2026", firstPage: "/pre-booking" },
  timeline: [
    { at: "2026-09-18T15:42:00+00:00", kind: "signed_in", list: null, source: null, subject: null, reason: null },
    { at: "2026-09-09T04:01:00+00:00", kind: "received", list: "news", source: null, subject: "Trakline news: the new look", reason: null },
    { at: "2026-09-02T04:44:00+00:00", kind: "signed_up", list: "news", source: "footer", subject: null, reason: null },
  ],
  tags: ["travel-desk"],
  notes: [
    { id: "b1111111-1111-4111-8111-111111111111", author: "Kiran Das", at: "2026-09-12T11:10:00+00:00", body: "Asked about group bookings. Wrote from [removed]." },
    { id: "b2222222-2222-4222-8222-222222222222", author: "Asha Rao", at: "2026-09-03T05:35:00+00:00", body: "Came in from the Diwali campaign." },
  ],
  business: null,
};
const TAGS = ["beta", "press", "travel-desk", "vip"];
const NONE = parseLeadFilters({});

const browser = (over: Partial<Parameters<typeof LeadsBrowser>[0]> = {}) => render(<LeadsBrowser page={{ total: 3, rows: ROWS }} filters={NONE} detail={null} tags={TAGS} environment="production" {...over} />);
const table = () => screen.getByRole("table", { name: m.table.caption });
const tableRow = (text: string) => within(table()).getByRole("row", { name: new RegExp(text.replace(/[.•]/g, "\\$&")) });

beforeEach(() => {
  for (const fn of [push, refresh, requestFind, requestReveal, requestTag, requestNote, success, error]) fn.mockReset();
});

describe("NewsTag", () => {
  it("draws every status as a tag in one box: an edge on each, clear unless the form is an outline", () => {
    for (const status of ["subscribed", "pending", "unsubscribed", "suppressed", "none"] as const) {
      const { container, unmount } = render(<NewsTag status={status} />);
      const tag = container.firstElementChild as HTMLElement;
      expect(tag).toHaveTextContent(m.news[status]);
      expect(tag.className).toMatch(/\bborder\b/);
      unmount();
    }
  });

  it("makes Suppressed the solid one, and Not subscribed a tag like the rest, never plain text", () => {
    const { container } = render(<><NewsTag status="suppressed" /><NewsTag status="none" /></>);
    const [suppressed, none] = Array.from(container.children) as HTMLElement[];
    expect(suppressed!.className).toContain("bg-ink-alert");
    expect(none!.className).toContain("border-line-strong");
  });
});

describe("FiguresPlate", () => {
  it("draws the six figures, the total, and the line that keeps News and Account apart", () => {
    render(<FiguresPlate figures={{ total: 1612, pending: 37, subscribed: 431, unsubscribed: 58, suppressed: 4, accounts: 1204, availability: 217 }} />);
    const plate = screen.getByRole("region", { name: m.figures.title });
    expect(within(plate).getByText("1,612 leads")).toBeInTheDocument();
    for (const [label, value] of [[m.figures.pending, "37"], [m.figures.subscribed, "431"], [m.figures.unsubscribed, "58"], [m.figures.suppressed, "4"], [m.figures.accounts, "1,204"], [m.figures.availability, "217"]] as const) {
      expect(within(plate).getByText(label).parentElement).toHaveTextContent(value);
    }
    expect(within(plate).getByText(m.figures.note)).toBeInTheDocument();
  });

  it("says the figures could not be read, never zeroes", () => {
    render(<FiguresPlate figures={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(m.figures.unavailable);
  });
});

describe("the list", () => {
  it("draws each lead masked, with News and Account as separate columns", () => {
    browser();
    const asha = tableRow("a•••@example.com");
    expect(within(asha).getByRole("link", { name: m.table.open("a•••@example.com") })).toHaveAttribute("href", `/leads?lead=${encodeURIComponent(ASHA)}`);
    expect(within(asha).getByText(m.news.subscribed)).toBeInTheDocument();
    expect(within(asha).getByText(m.account.has)).toBeInTheDocument();
    expect(within(asha).getByText(m.sources.footer)).toBeInTheDocument();
    // The campaign by its name, with the whole of it a hover away: beside a Tags column there is no
    // room for source, medium and name (sheet 22, part two).
    expect(within(asha).getByText("diwali-2026")).toHaveAttribute("title", "google / cpc / diwali-2026");
    expect(within(asha).getByText("travel-desk")).toBeInTheDocument();
    const three = tableRow("m•••@example.org");
    expect(within(three).getByText("beta")).toBeInTheDocument();
    expect(within(three).getByText("+2")).toHaveAttribute("title", "beta, press, vip");
    expect(within(three).queryByText("press")).not.toBeInTheDocument();
    const account = tableRow("d•••@example.com");
    expect(within(account).getByText(m.news.none)).toBeInTheDocument();
    expect(within(account).getByText(m.account.disabled)).toBeInTheDocument();
    expect(within(account).getByText(m.table.availability)).toBeInTheDocument();
    expect(within(table()).queryByText(/last sign-in/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("1–3 of 3").length).toBeGreaterThan(0);
  });

  it("reveals an address on request, and then has nothing more to reveal on that row", async () => {
    requestReveal.mockResolvedValue({ kind: "done", address: "asha.verma@example.com" });
    browser();
    await userEvent.click(within(tableRow("a•••@example.com")).getByRole("button", { name: m.table.revealLabel("a•••@example.com") }));
    expect(requestReveal).toHaveBeenCalledWith(ASHA);
    const revealed = tableRow("asha.verma@example.com");
    expect(within(revealed).queryByRole("button", { name: /Reveal/ })).not.toBeInTheDocument();
  });

  it("draws the same leads as cards for a phone, each one a single link to its record", () => {
    browser();
    const cards = screen.getByRole("list", { name: m.table.caption });
    expect(within(cards).getAllByRole("listitem")).toHaveLength(3);
    const card = within(cards).getByRole("link", { name: m.table.open("m•••@example.org") });
    // A card has the room the table's column does not: every tag, in full.
    for (const tag of ["beta", "press", "vip"]) expect(within(card).getByText(tag)).toBeInTheDocument();
    expect(within(cards).queryByRole("button")).not.toBeInTheDocument();
  });

  it("says there are no leads yet, or that the filters match nobody, or that the list could not be read", () => {
    const empty = browser({ page: { total: 0, rows: [] } });
    expect(screen.getByText(m.states.emptyTitle)).toBeInTheDocument();
    empty.unmount();
    const filtered = browser({ page: { total: 0, rows: [] }, filters: parseLeadFilters({ news: "pending" }) });
    expect(screen.getByText(m.states.filteredTitle)).toBeInTheDocument();
    filtered.unmount();
    browser({ page: null });
    expect(screen.getByRole("alert")).toHaveTextContent(m.states.errorTitle);
    expect(screen.queryByText(m.states.emptyTitle)).not.toBeInTheDocument();
  });

  it("pages with links, and has none where there is nowhere to go", () => {
    browser({ page: { total: 120, rows: ROWS }, filters: parseLeadFilters({ page: "2", news: "pending" }) });
    expect(screen.getAllByText("51–100 of 120").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: m.table.previous })).toHaveAttribute("href", "/leads?news=pending");
    expect(screen.getByRole("link", { name: m.table.next })).toHaveAttribute("href", "/leads?news=pending&page=3");
  });
});

describe("the filters", () => {
  it("writes a picked filter to the address, and goes back to the first page", async () => {
    browser({ filters: parseLeadFilters({ page: "3" }) });
    await userEvent.selectOptions(screen.getAllByLabelText(m.filters.news)[0]!, "subscribed");
    expect(push).toHaveBeenCalledWith("/leads?news=subscribed");
    await userEvent.selectOptions(screen.getAllByLabelText(m.filters.seen)[0]!, "30d");
    expect(push).toHaveBeenCalledWith("/leads?seen=30d");
  });

  it("offers every tag in use as a filter, and one in the address that nobody carries any more", async () => {
    const stale = browser({ filters: parseLeadFilters({ tag: "retired" }) });
    const picker = screen.getAllByLabelText(m.filters.tag)[0] as HTMLSelectElement;
    expect(Array.from(picker.options).map((o) => o.value)).toEqual(["", "retired", ...TAGS]);
    expect(picker.value).toBe("retired");
    stale.unmount();
    browser();
    await userEvent.selectOptions(screen.getAllByLabelText(m.filters.tag)[0]!, "press");
    expect(push).toHaveBeenCalledWith("/leads?tag=press");
  });
});

describe("search by full email", () => {
  const search = async (text: string) => {
    await userEvent.type(screen.getAllByRole("searchbox", { name: m.filters.search })[0]!, `${text}{Enter}`);
  };

  it("sends the whole address in a request, never to the page's address, and shows the match still masked", async () => {
    requestFind.mockResolvedValue({ kind: "done", lead: ROWS[0] });
    browser();
    await search("asha.verma@example.com");
    expect(requestFind).toHaveBeenCalledWith("asha.verma@example.com");
    expect(push).not.toHaveBeenCalled();
    expect(within(table()).getAllByRole("row")).toHaveLength(2);
    expect(tableRow("a•••@example.com")).toBeInTheDocument();
    expect(screen.getAllByText(m.table.oneMatch).length).toBeGreaterThan(0);
    expect(screen.getByText(m.filters.exact)).toBeInTheDocument();
  });

  it("says nobody has that address, and that the lookup was logged", async () => {
    requestFind.mockResolvedValue({ kind: "done", lead: null });
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
    expect(requestFind).not.toHaveBeenCalled();
  });

  it("goes back to the whole list when the filter is cleared", async () => {
    requestFind.mockResolvedValue({ kind: "done", lead: ROWS[0] });
    browser();
    await search("asha.verma@example.com");
    await userEvent.click(screen.getByRole("button", { name: m.filters.clear }));
    expect(within(table()).getAllByRole("row")).toHaveLength(4);
    expect(screen.queryByText(m.filters.exact)).not.toBeInTheDocument();
  });

  it("shows why a lookup failed and leaves the list as it was", async () => {
    requestFind.mockResolvedValue({ kind: "failed", message: m.errors.database });
    browser();
    await search("asha.verma@example.com");
    expect(error).toHaveBeenCalledWith(m.errors.database);
    expect(within(table()).getAllByRole("row")).toHaveLength(4);
  });
});

describe("the lead's record", () => {
  it("opens over the list with the consent in full, the account, the campaign and the timeline", () => {
    browser({ detail: DETAIL, filters: parseLeadFilters({ lead: ASHA }) });
    const record = screen.getByRole("dialog", { name: m.record.title });
    expect(within(record).getByText("a•••@example.com")).toBeInTheDocument();
    expect(within(record).getByText(/^Consented 0?2 Sep.* IST via the footer form · notice v1\.1 · confirmed 0?2 Sep.* IST$/)).toBeInTheDocument();
    expect(within(record).getByText(m.record.notOnList)).toBeInTheDocument();
    expect(within(record).getByText("Email link · 1 passkey")).toBeInTheDocument();
    expect(within(record).getByText(m.record.pnrs("3"))).toBeInTheDocument();
    expect(within(record).getByText("/pre-booking")).toBeInTheDocument();
    expect(within(record).getByText("Received “Trakline news: the new look”")).toBeInTheDocument();
    expect(within(record).getByText("Signed up for News via the footer form")).toBeInTheDocument();
    expect(within(record).getByText(m.record.retention)).toBeInTheDocument();
  });

  it("reveals the address in the record, says it was logged, and the row behind it follows", async () => {
    requestReveal.mockResolvedValue({ kind: "done", address: "asha.verma@example.com" });
    browser({ detail: DETAIL, filters: parseLeadFilters({ lead: ASHA }) });
    const record = screen.getByRole("dialog", { name: m.record.title });
    await userEvent.click(within(record).getByRole("button", { name: m.table.revealLabel("a•••@example.com") }));
    expect(within(record).getByText("asha.verma@example.com")).toBeInTheDocument();
    expect(within(record).getByText(m.record.revealed)).toBeInTheDocument();
    expect(within(record).queryByRole("button", { name: /Reveal/ })).not.toBeInTheDocument();
  });

  // Found by the real-browser run: once the address is revealed nothing in the record's scrolling
  // part takes focus, so a keyboard had no way to scroll it. The part itself is the stop.
  it("lets a keyboard reach the record's scrolling part, whether or not Reveal is still in it", async () => {
    requestReveal.mockResolvedValue({ kind: "done", address: "asha.verma@example.com" });
    browser({ detail: DETAIL, filters: parseLeadFilters({ lead: ASHA }) });
    const record = screen.getByRole("dialog", { name: m.record.title });
    const body = within(record).getByRole("region", { name: m.record.details });
    expect(body).toHaveAttribute("tabindex", "0");
    expect(within(body).getByText(m.record.timeline)).toBeInTheDocument();
    await userEvent.click(within(record).getByRole("button", { name: m.table.revealLabel("a•••@example.com") }));
    expect(within(record).getByRole("region", { name: m.record.details })).toHaveAttribute("tabindex", "0");
  });

  it("closes to the same list, with the lead gone from the address", async () => {
    browser({ detail: DETAIL, filters: parseLeadFilters({ lead: ASHA, news: "subscribed" }) });
    await userEvent.click(within(screen.getByRole("dialog", { name: m.record.title })).getByRole("button", { name: "Close" }));
    expect(push).toHaveBeenCalledWith("/leads?news=subscribed");
  });

  it("says a record could not be read, or is no longer there", () => {
    const failed = browser({ detail: "unavailable", filters: parseLeadFilters({ lead: ASHA }) });
    expect(within(screen.getByRole("dialog", { name: m.record.title })).getByText(m.record.unavailable)).toBeInTheDocument();
    failed.unmount();
    browser({ detail: "gone", filters: parseLeadFilters({ lead: ASHA }) });
    expect(within(screen.getByRole("dialog", { name: m.record.title })).getByText(m.record.gone)).toBeInTheDocument();
  });
});

describe("tags on the record", () => {
  const open = () => {
    browser({ detail: DETAIL, filters: parseLeadFilters({ lead: ASHA }) });
    return screen.getByRole("dialog", { name: m.record.title });
  };
  const addTag = async (record: HTMLElement, text: string) => {
    await userEvent.type(within(record).getByRole("combobox", { name: m.record.addTag }), text);
    await userEvent.click(within(record).getByRole("button", { name: m.record.add }));
  };

  it("adds a tag, lowered, and shows the lead's tags as the server answered them", async () => {
    requestTag.mockResolvedValue({ kind: "done", tags: ["press", "travel-desk"] });
    const record = open();
    await addTag(record, " Press ");
    expect(requestTag).toHaveBeenCalledWith(ASHA, "press");
    expect(within(record).getByRole("button", { name: m.record.removeTag("press") })).toBeInTheDocument();
    expect(within(record).getByRole("combobox", { name: m.record.addTag })).toHaveValue("");
    // The list behind the record carries tags too, and so does the Tag filter: both are re-read.
    expect(refresh).toHaveBeenCalled();
  });

  it("refuses what is not a tag in the form's own words, without a request", async () => {
    const record = open();
    await addTag(record, "two words");
    expect(within(record).getByRole("alert")).toHaveTextContent(m.errors.notTag);
    expect(requestTag).not.toHaveBeenCalled();
  });

  it("removes a tag", async () => {
    requestTag.mockResolvedValue({ kind: "done", tags: [] });
    const record = open();
    await userEvent.click(within(record).getByRole("button", { name: m.record.removeTag("travel-desk") }));
    expect(requestTag).toHaveBeenCalledWith(ASHA, "travel-desk", true);
    expect(within(record).queryByText("travel-desk")).not.toBeInTheDocument();
    expect(within(record).getByText(m.record.noTags)).toBeInTheDocument();
  });

  it("says why a tag was refused, and leaves the tags as they were", async () => {
    requestTag.mockResolvedValue({ kind: "failed", message: m.errors.tooManyTags });
    const record = open();
    await addTag(record, "press");
    expect(error).toHaveBeenCalledWith(m.errors.tooManyTags);
    expect(within(record).getByRole("button", { name: m.record.removeTag("travel-desk") })).toBeInTheDocument();
    expect(within(record).queryByRole("button", { name: m.record.removeTag("press") })).not.toBeInTheDocument();
  });
});

describe("notes on the record", () => {
  const open = (detail: LeadDetail = DETAIL) => {
    browser({ detail, filters: parseLeadFilters({ lead: ASHA }) });
    return screen.getByRole("dialog", { name: m.record.title });
  };

  it("lists the notes, each signed and dated, and says when there are none", () => {
    const record = open();
    const notes = within(within(record).getByRole("list", { name: m.record.notes })).getAllByRole("listitem");
    expect(notes).toHaveLength(2);
    expect(notes[0]).toHaveTextContent(/^Kiran Das · 12 Sept? 2026, 16:40 ISTAsked about group bookings\. Wrote from \[removed\]\.$/);
    expect(notes[1]).toHaveTextContent("Came in from the Diwali campaign.");
  });

  it("says there are no notes yet", () => {
    const record = open({ ...DETAIL, notes: [] });
    expect(within(record).getByText(m.record.noNotes)).toBeInTheDocument();
    expect(within(record).queryByRole("list", { name: m.record.notes })).not.toBeInTheDocument();
  });

  it("adds a note and shows it as the database stored it, not as it was typed", async () => {
    const stored = { id: "b3333333-3333-4333-8333-333333333333", author: "Asha Rao", at: "2026-09-19T09:02:00+00:00", body: "Rang back from [removed]." };
    requestNote.mockResolvedValue({ kind: "done", notes: [stored, ...DETAIL.notes] });
    const record = open();
    const box = within(record).getByRole("textbox", { name: m.record.addNote });
    await userEvent.type(box, "Rang back from someone@example.com.");
    await userEvent.click(within(record).getByRole("button", { name: m.record.addNoteButton }));
    expect(requestNote).toHaveBeenCalledWith(ASHA, "Rang back from someone@example.com.");
    expect(within(record).getByText("Rang back from [removed].")).toBeInTheDocument();
    expect(within(record).queryByText(/someone@example\.com/)).not.toBeInTheDocument();
    expect(box).toHaveValue("");
  });

  it("refuses an empty note in the form's own words, without a request", async () => {
    const record = open();
    await userEvent.click(within(record).getByRole("button", { name: m.record.addNoteButton }));
    expect(within(record).getByRole("alert")).toHaveTextContent(m.errors.emptyNote);
    expect(requestNote).not.toHaveBeenCalled();
  });

  it("says why a note was not kept, and keeps what was typed", async () => {
    requestNote.mockResolvedValue({ kind: "failed", message: m.errors.database });
    const record = open();
    const box = within(record).getByRole("textbox", { name: m.record.addNote });
    await userEvent.type(box, "A note worth keeping.");
    await userEvent.click(within(record).getByRole("button", { name: m.record.addNoteButton }));
    expect(error).toHaveBeenCalledWith(m.errors.database);
    expect(box).toHaveValue("A note worth keeping.");
  });
});
