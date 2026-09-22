import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEntry, AuditEntryDetail, AuditPage } from "@/console/audit/audit";
import { defaultAuditFilters } from "@/console/audit/filters";
import { consoleMessages } from "@/console/messages";

// The two things stood in for: the browser-side re-read the filter bar and the pager drive, and the
// key ceremony the export spends. Everything else -- the real DataTable, the real Plate, the real
// filter bar, the real export provider and the real TC-01 -- runs.
const { apiRequest, runTap } = vi.hoisted(() => ({ apiRequest: vi.fn(), runTap: vi.fn() }));
vi.mock("@/services/api-client", () => ({ apiRequest }));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));

import { EntriesPlate } from "@/console/audit/entries-plate";

const m = consoleMessages.audit;

const ASHA: AuditEntry = {
  id: "5a000000-0000-4000-8000-000000000013",
  at: "2026-09-19T08:32:31.256374+00:00",
  environment: "production",
  actorId: "a0000000-0000-4000-8000-000000000001",
  actorName: "Asha Rao",
  actorRole: "owner",
  keyId: "f0000000-0000-4000-8000-00000000000f",
  sessionLabel: "Chrome on macOS",
  category: "configure",
  action: "Paused PNR checks",
  target: "PNR checks",
  reason: "Provider maintenance window, 14:00-15:00 IST.",
  result: "done",
  addressHash: "a3f9c2c1",
  before: { pnr_checks: "on" },
  after: { pnr_checks: "paused" },
};

// The System row the sheet draws at 02:00: no actor, no role, no reason, no address.
const SYSTEM: AuditEntry = {
  ...ASHA,
  id: "5a000000-0000-4000-8000-000000000001",
  at: "2026-09-18T20:30:00+00:00",
  actorId: null,
  actorName: "System",
  actorRole: null,
  keyId: null,
  sessionLabel: null,
  category: "system",
  action: "Purged unconfirmed sign-ups",
  target: "12 records",
  reason: null,
  addressHash: null,
  before: null,
  after: null,
};

const PAGE: AuditPage = { rows: [ASHA, SYSTEM], total: 2 };

function plate(initial: AuditPage | null = PAGE) {
  return <EntriesPlate initial={initial} filters={defaultAuditFilters("production")} environment="production" />;
}

/**
 * One of the two layouts, by name.
 *
 * Both are in the tree at once and CSS picks between them (the ConsoleRail/ConsoleRailDrawer
 * pattern), so in jsdom -- which has no CSS at all -- an entry's control exists twice under the one
 * accessible name the sheets give it. In a browser only one of the two is ever in the accessibility
 * tree, because `display: none` removes a subtree from it; here the query has to say which layout
 * it means. That a phone genuinely reaches only the cards is measured at 390px in
 * tests/e2e/console-auth/scans.spec.ts.
 */
function layout(which: "table" | "cards"): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-layout="${which}"]`);
  if (!found) throw new Error(`no ${which} layout rendered`);
  return found;
}
const tableLayout = () => layout("table");
const cardsLayout = () => layout("cards");

beforeEach(() => {
  apiRequest.mockReset().mockResolvedValue({ ok: true, data: { ok: true, rows: [], total: 0 } });
  runTap.mockReset().mockResolvedValue({ kind: "done" });
});

/** The export's own answer, for the one case that drives a real export through the real provider. */
const PREPARED = { ok: true, csv: "﻿id,at\r\n1,2", count: 2, fileName: "audit-2026-09-19.csv" };

/** The `max-sm:hidden` ancestor of an element, if it has one. `null` is "nothing gates this". */
function phoneGateAround(el: HTMLElement): Element | null {
  return el.closest(".max-sm\\:hidden");
}

describe("the Entries table", () => {
  // The sheet's eight drawn columns keep their own relative order -- Open last, as the sheet draws
  // it (:160) -- and Environment, which the sheet predates, sits second so the column that must
  // always be readable is never the one that scrolls out of view (task-2-addendum.md §4, and
  // task-2-report.md on where the e2e screenshot put it).
  it("draws every column the sheet draws, in the sheet's own order", () => {
    render(plate());
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual([
      m.entries.columns.time,
      m.entries.columns.environment,
      m.entries.columns.member,
      m.entries.columns.action,
      m.entries.columns.target,
      m.entries.columns.reason,
      m.entries.columns.result,
      m.entries.columns.address,
      m.entries.columns.open,
    ]);
  });

  // DataTable prints each header into `data-label` for the stacked phone layout, where a ReactNode
  // becomes "[object Object]" (task-2-addendum.md §6; src/components/ui/data-table.tsx's own note).
  it("gives every column a plain string header, never a node", () => {
    for (const header of Object.values(m.entries.columns)) expect(typeof header).toBe("string");
  });

  it("draws a full row: the time in IST, the actor and their role, the reason in the sheet's quotes", () => {
    render(plate());
    const row = screen.getByRole("row", { name: /Paused PNR checks/ });
    // The sheet writes "19 Sep 2026"; en-IN's own short month is "Sept", and this uses the house
    // formatter (src/utils/datetime.ts) every other console surface already prints dates with --
    // one product-wide date, not one page's transcription of a static mock (task-2-report.md).
    expect(within(row).getByText(`19 Sept 2026, 14:02 ${consoleMessages.frameSignedIn.clock.ist}`)).toBeInTheDocument();
    expect(within(row).getByText("Asha Rao")).toBeInTheDocument();
    expect(within(row).getByText("Owner")).toBeInTheDocument();
    expect(within(row).getByText("“Provider maintenance window, 14:00-15:00 IST.”")).toBeInTheDocument();
    expect(within(row).getByText("Done")).toBeInTheDocument();
  });

  // The sheet draws an em dash for a row with no reason and no address, and no role tag at all for
  // the System row (`hasRole` is false there).
  it("draws the System row without inventing a role, a reason or an address for it", () => {
    render(plate());
    const row = screen.getByRole("row", { name: /Purged unconfirmed sign-ups/ });
    expect(within(row).getByText("System")).toBeInTheDocument();
    expect(within(row).getAllByText(m.entries.none)).toHaveLength(2);
    for (const role of Object.values(consoleMessages.frame.roleLabel)) expect(within(row).queryByText(role)).toBeNull();
  });

  // task-2-addendum.md §4: every row shows its environment. Non-negotiable -- a log that silently
  // drops rows, or shows a preview row as though it were production's, lies by omission.
  it("shows which environment every row came from", () => {
    render(plate());
    for (const row of screen.getAllByRole("row").slice(1)) expect(within(row).getByText("production")).toBeInTheDocument();
  });

  it("names the table for a screen reader in the sheet's own words", () => {
    render(plate());
    expect(screen.getByRole("region", { name: m.entries.caption.today })).toBeInTheDocument();
  });

  it("counts the filtered set in the plate's own header cell", () => {
    render(<EntriesPlate initial={{ rows: [ASHA], total: 137 }} filters={defaultAuditFilters("production")} environment="production" />);
    expect(screen.getByText(m.entries.rangeCell(m.filters.ranges.today, 137))).toBeInTheDocument();
  });
});

// The sheet's ninth column (:160): a visually-hidden "Open" header over a control per row, whose
// accessible name is the sheet's own -- "Open the entry: <action> at <time> IST". Task 2 left the
// column out deliberately, because a hidden header over empty cells announces a control that is not
// there; this is the task that fills it.
describe("the Open column", () => {
  it("hides the Open header from the screen but not from a screen reader", () => {
    render(plate());
    const header = screen.getByRole("columnheader", { name: m.entries.columns.open });
    expect(header).toBeInTheDocument();
    expect(header.querySelector(".sr-only")).not.toBeNull();
  });

  it("names each row's control as the sheet names it", () => {
    render(plate());
    expect(within(tableLayout()).getByRole("button", { name: `Open the entry: Paused PNR checks at 14:02 ${consoleMessages.frameSignedIn.clock.ist}` })).toBeInTheDocument();
    // The System row is an entry like any other and gets a control of its own, named after its own
    // action and its own time -- 02:00 IST, the row the sheet draws at the bottom of its table.
    expect(within(tableLayout()).getByRole("button", { name: `Open the entry: Purged unconfirmed sign-ups at 02:00 ${consoleMessages.frameSignedIn.clock.ist}` })).toBeInTheDocument();
  });

  it("opens the drawer on the row that was pressed, and no other", async () => {
    const detail: AuditEntryDetail = { ...ASHA, keyName: "YubiKey 5C" };
    apiRequest.mockResolvedValue({ ok: true, data: { ok: true, entry: detail } });
    render(plate());
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(within(tableLayout()).getByRole("button", { name: `Open the entry: Paused PNR checks at 14:02 ${consoleMessages.frameSignedIn.clock.ist}` }));
    const dialog = await screen.findByRole("dialog", { name: m.entry.title });
    expect(within(dialog).getByText(ASHA.id)).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining(`id=${ASHA.id}`), expect.objectContaining({ method: "GET" }), expect.anything());
  });

  // The other half of the same wiring: a card opens the same drawer through the same handler, so
  // the entry a phone opens is the one the drawer reads -- not the row the list already had.
  it("opens the same drawer from a card", async () => {
    const detail: AuditEntryDetail = { ...ASHA, keyName: "YubiKey 5C" };
    apiRequest.mockResolvedValue({ ok: true, data: { ok: true, entry: detail } });
    render(plate());
    await userEvent.click(within(cardsLayout()).getByRole("button", { name: `Open the entry: Paused PNR checks at 14:02 ${consoleMessages.frameSignedIn.clock.ist}` }));
    expect(await screen.findByRole("dialog", { name: m.entry.title })).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining(`id=${ASHA.id}`), expect.objectContaining({ method: "GET" }), expect.anything());
  });
});

describe("the Member picker's options", () => {
  // `console_team` is Owner-only and this module is Owner+Admin, so the rows are the only roster
  // module 14 can reach. The System row has no actor and must not become a member to filter by.
  it("offers the actors the loaded rows name, and not the System row", () => {
    render(plate());
    const picker = screen.getByRole("combobox", { name: m.filters.member });
    expect(within(picker).getByRole("option", { name: "Asha Rao" })).toBeInTheDocument();
    expect(within(picker).queryByRole("option", { name: "System" })).toBeNull();
  });

  // Filtering by one member narrows the rows to that member. If the picker were derived from the
  // page in hand, it would narrow with them and leave no way to switch to anyone else.
  it("keeps an actor it has already seen after a filter narrows the rows past them", async () => {
    const rohan: AuditEntry = { ...ASHA, id: "5a000000-0000-4000-8000-000000000099", actorId: "a0000000-0000-4000-8000-000000000002", actorName: "Rohan Iyer" };
    apiRequest.mockResolvedValue({ ok: true, data: { ok: true, rows: [rohan], total: 1 } });
    render(<EntriesPlate initial={{ rows: [ASHA], total: 1 }} filters={defaultAuditFilters("production")} environment="production" />);
    await userEvent.click(screen.getByRole("button", { name: m.filters.ranges["7d"] }));
    const picker = await screen.findByRole("combobox", { name: m.filters.member });
    expect(within(picker).getByRole("option", { name: "Rohan Iyer" })).toBeInTheDocument();
    expect(within(picker).getByRole("option", { name: "Asha Rao" })).toBeInTheDocument();
  });
});

describe("the Entries plate's states", () => {
  it("draws the empty state, and a Clear filters button beside it", () => {
    render(plate({ rows: [], total: 0 }));
    expect(screen.getByText(m.empty.title)).toBeInTheDocument();
    expect(screen.getByText(m.empty.detail)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.empty.action })).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  // `initial: null` is the server-side read having failed. The sheet draws this state with
  // role="alert", unlike its no-access sibling.
  it("draws the error state as an alert when the page arrived without its rows", () => {
    render(plate(null));
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(m.error.title)).toBeInTheDocument();
    expect(within(alert).getByText(m.error.detail)).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: m.error.action })).toBeInTheDocument();
  });

  it("retries from the route rather than reloading the page", async () => {
    apiRequest.mockResolvedValue({ ok: true, data: { ok: true, rows: [ASHA], total: 1 } });
    render(plate(null));
    await userEvent.click(screen.getByRole("button", { name: m.error.action }));
    expect(apiRequest).toHaveBeenCalledOnce();
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("falls back to the error state when the re-read itself fails", async () => {
    apiRequest.mockResolvedValue({ ok: false, error: { ok: false, code: "SOURCE_UNAVAILABLE", message: "raw driver words" } });
    render(plate());
    await userEvent.click(screen.getByRole("button", { name: m.filters.ranges["30d"] }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // A database refusal is a developer string and must never reach a member (task-2-addendum.md §7).
    expect(screen.queryByText("raw driver words")).toBeNull();
  });
});

/**
 * The phone (AuditLogPhone.dc.html). Both layouts stay in the tree and CSS chooses between them --
 * the pattern ConsoleRail/ConsoleRailDrawer and the Team page already use -- so jsdom, which has no
 * layout at all, can only say that each is present and gated. That a phone genuinely cannot reach
 * the export is measured in a real Chromium at 390px
 * (tests/e2e/console-auth/scans.spec.ts), which is where `getByRole` stops seeing what
 * `display: none` takes out of the accessibility tree.
 */
describe("the two layouts", () => {
  it("carries the table for a wide screen and the cards for a phone, each gated", () => {
    render(plate());
    expect(within(tableLayout()).getByRole("table")).toBeInTheDocument();
    expect(tableLayout().className).toContain("max-sm:hidden");
    // The cards are not the table narrowed: one control per entry, named as the sheet names it.
    expect(within(cardsLayout()).getAllByRole("button")).toHaveLength(PAGE.rows.length);
    expect(cardsLayout().className).toContain("sm:hidden");
    expect(within(cardsLayout()).queryByRole("table")).toBeNull();
  });

  // One pager under both, not one each: two would put two "Next" buttons in the tree with the same
  // name, and the range line is the same sentence either way.
  it("draws one pager for both, at a 44px target on a phone", () => {
    render(<EntriesPlate initial={{ rows: [ASHA], total: 137 }} filters={defaultAuditFilters("production")} environment="production" />);
    for (const name of [m.entries.previous, m.entries.next]) {
      expect(screen.getByRole("button", { name }).className, name).toContain("max-sm:h-11");
    }
    expect(screen.getByText(m.entries.pageRange(1, 1, 137))).toBeInTheDocument();
  });
});

/**
 * AuditLogPhone.dc.html:64 -- the one thing the phone genuinely loses. The line sits under the page
 * lead, where the desktop draws `Export CSV`, and it is the house device its sibling phone sheets
 * already use (ConsoleTeamPhone's "… to manage the team.", ConsoleSwitchesPhone's "… to edit").
 */
describe("the export, at phone width", () => {
  it("draws the sheet's line in place of the control", () => {
    render(plate());
    const line = screen.getByText(m.exportOnLargerScreen);
    expect(line.className).toContain("sm:hidden");
  });

  it("gates the one slot the export control lives in", () => {
    render(plate());
    const control = screen.getByRole("button", { name: m.export.action });
    expect(control.parentElement?.className).toContain("max-sm:hidden");
  });

  /**
   * The line belongs to exactly the states the sheet draws it in. `showMeta`
   * (AuditLogPhone.dc.html:62, `stRows || state === 'Empty'`) is true for Ready and Empty and false
   * for Loading, Error and No access -- and in this component Ready and Empty are one status, since
   * an empty page is a read that succeeded and returned nothing.
   *
   * The cost of transcribing it rather than softening it is real and is accepted: `status` here
   * goes to `loading` on every filter change and every page turn, not only on a first paint as the
   * sheet's own Loading state does, so the line leaves and returns each time. The plate below it is
   * swapping to a four-card skeleton in the same moment, so it is not the only thing moving -- and
   * a sentence that renders in a state the sheet's own flag excludes is a transcription error,
   * where a blink is a design question for the sheet.
   */
  it("draws the line for a page that has rows and for one that has none", () => {
    render(plate());
    expect(screen.getByText(m.exportOnLargerScreen)).toBeInTheDocument();
    cleanup();
    render(plate({ rows: [], total: 0 }));
    expect(screen.getByText(m.exportOnLargerScreen), "the sheet's Empty state").toBeInTheDocument();
  });

  it("says nothing about exporting on a page that failed to load", () => {
    render(plate(null));
    expect(screen.queryByText(m.exportOnLargerScreen)).toBeNull();
  });

  it("says nothing about exporting while a read is in flight", async () => {
    apiRequest.mockReturnValue(new Promise(() => {}));
    render(plate());
    await userEvent.click(screen.getByRole("button", { name: m.filters.ranges["7d"] }));
    // Two, one per layout: the table's eight rows of five bars (AuditLog.dc.html:184-191) and the
    // phone's four card-shaped blocks (AuditLogPhone.dc.html:121-127). Both are in the tree and CSS
    // picks one, so a browser only ever announces one of them.
    await waitFor(() => expect(screen.getAllByRole("status", { name: m.entries.loading })).toHaveLength(2));
    expect(screen.queryByText(m.exportOnLargerScreen)).toBeNull();
  });
});

/**
 * **The Download is deliberately not gated, and this is the test that says so.**
 *
 * Every other export control is hidden below sm, because AuditLogPhone.dc.html draws none of them
 * and replaces them with one line. The Ready row is the exception, and the exception is the point:
 * it can only exist because someone started an export on a wide screen, and the single way to see
 * it at 390px is to narrow that screen afterwards. Hiding it there would take away a single-use
 * export that has **already spent a tap and already written its own audit row** -- leaving a
 * permanent record, in a table with no update and no delete, of an export nobody received. That is
 * the exact harm Task 4 built this state to avoid.
 *
 * So the asymmetry is intended: the control that *starts* an export is gated, the control that
 * *finishes* one already begun is not. Anyone reading entries-plate.tsx and reaching for a
 * `max-sm:hidden` around `AuditExportStatus` should be stopped here, by this test, rather than by a
 * reviewer three phases later.
 */
describe("the Download, once an export is prepared", () => {
  it("stays reachable at phone width, unlike the control that starts one", async () => {
    apiRequest.mockImplementation((url: string) =>
      Promise.resolve(url.includes("/api/audit/export") ? { ok: true, data: PREPARED } : { ok: true, data: { ok: true, rows: [], total: 0 } }),
    );
    render(plate());

    // The whole confirm step, as a member performs it: TC-01, a reason, a real tap.
    await userEvent.click(screen.getByRole("button", { name: m.export.action }));
    await userEvent.type(screen.getByLabelText("Reason"), "Monthly access review for September.");
    await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));

    const download = await screen.findByRole("button", { name: m.export.download });
    expect(screen.getByText(m.export.works)).toBeInTheDocument();
    expect(phoneGateAround(download), "the Download must stay reachable after a narrow").toBeNull();
    // The paired half, in the same case, so the asymmetry is the assertion rather than a coincidence.
    expect(phoneGateAround(screen.getByRole("button", { name: m.export.action })), "the control that starts an export").not.toBeNull();
  });
});

describe("the pager", () => {
  it("says which slice of the filtered set is on screen", () => {
    render(<EntriesPlate initial={{ rows: [ASHA], total: 137 }} filters={defaultAuditFilters("production")} environment="production" />);
    expect(screen.getByText(m.entries.pageRange(1, 1, 137))).toBeInTheDocument();
  });

  it("offers no Previous on the first page and no Next on the last", () => {
    render(plate());
    expect(screen.getByRole("button", { name: m.entries.previous })).toBeDisabled();
    expect(screen.getByRole("button", { name: m.entries.next })).toBeDisabled();
  });

  // Paging re-reads from the route; it never re-renders the page server-side, because the server
  // render is what writes the "Opened the audit log" row (task-2-addendum.md §5).
  it("asks the route for the next page", async () => {
    render(<EntriesPlate initial={{ rows: [ASHA], total: 137 }} filters={defaultAuditFilters("production")} environment="production" />);
    await userEvent.click(screen.getByRole("button", { name: m.entries.next }));
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining("page=2"), expect.objectContaining({ method: "GET" }), expect.anything());
  });
});
