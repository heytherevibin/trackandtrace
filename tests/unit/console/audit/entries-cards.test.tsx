import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "@/console/audit/audit";
import { EntriesCards } from "@/console/audit/entries-cards";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.audit;
const ist = consoleMessages.frameSignedIn.clock.ist;

// The sheet's own first row (AuditLogPhone.dc.html:190), in the shape console.audit_row really
// serialises: an offset rather than a "Z", and the fractional part present because these
// microseconds are not zero (task-1-report.md's own two shapes).
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
  addressHash: "a3f9…c2c1",
  before: { pnr_checks: "on" },
  after: { pnr_checks: "paused" },
};

// The sheet's 02:00 row (:202): no actor, no role, no reason, no address. `hasRole` is drawn
// (AuditLogPhone.dc.html:107), so this row is the reason it exists.
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

function cards(rows: readonly AuditEntry[] = [ASHA, SYSTEM], onOpen: (row: AuditEntry) => void = () => {}) {
  return <EntriesCards rows={rows} onOpen={onOpen} />;
}

const ASHA_LABEL = `Open the entry: Paused PNR checks at 14:02 ${ist}`;

describe("an entry card", () => {
  // AuditLogPhone.dc.html:103-112. Not a table row narrowed: a top row of time and result, the
  // action under it, then four labelled cells in two columns.
  it("draws the time, the result, the action and the sheet's four labelled cells", () => {
    render(cards([ASHA]));
    const card = screen.getByRole("button", { name: ASHA_LABEL });
    expect(within(card).getByText(`19 Sept 2026, 14:02 ${ist}`)).toBeInTheDocument();
    expect(within(card).getByText(m.results.done)).toBeInTheDocument();
    expect(within(card).getByText("Paused PNR checks")).toBeInTheDocument();

    for (const label of [m.entries.columns.member, m.entries.columns.target, m.entries.columns.reason, m.entries.columns.address]) {
      expect(within(card).getByText(label)).toBeInTheDocument();
    }
    expect(within(card).getByText("Asha Rao")).toBeInTheDocument();
    expect(within(card).getByText(consoleMessages.frame.roleLabel.owner)).toBeInTheDocument();
    expect(within(card).getByText("PNR checks")).toBeInTheDocument();
    expect(within(card).getByText("“Provider maintenance window, 14:00-15:00 IST.”")).toBeInTheDocument();
    expect(within(card).getByText("a3f9…c2c1")).toBeInTheDocument();
  });

  // task-2-addendum.md §4, which the phone sheet predates exactly as the desktop sheet did: every
  // row says which deployment wrote it. The desktop table carries an undrawn Environment column for
  // this; a card that dropped it would be the same lie in a narrower place.
  it("says which environment the row came from, though the sheet draws no cell for it", () => {
    render(cards([ASHA]));
    expect(within(screen.getByRole("button", { name: ASHA_LABEL })).getByText("production")).toBeInTheDocument();
  });

  // `hasRole` (:107): the System row has no role and gets no tag rather than an empty one, and the
  // sheet's own em dash stands in for the reason and the address it also has none of.
  it("draws the System row without inventing a role, a reason or an address", () => {
    render(cards([SYSTEM]));
    const card = screen.getByRole("button", { name: `Open the entry: Purged unconfirmed sign-ups at 02:00 ${ist}` });
    expect(within(card).getByText("System")).toBeInTheDocument();
    for (const role of Object.values(consoleMessages.frame.roleLabel)) expect(within(card).queryByText(role)).toBeNull();
    expect(within(card).getAllByText(m.entries.none)).toHaveLength(2);
  });

  // :108-109 -- Target and Reason are the two cells the sheet holds to one line. A wrapped reason
  // is what turns a fourteen-card list into a page nobody scrolls to the bottom of.
  it("holds Target and Reason to one line and lets Member and Address wrap", () => {
    render(cards([ASHA]));
    const card = screen.getByRole("button", { name: ASHA_LABEL });
    const valueOf = (label: string) => within(card).getByText(label).parentElement?.lastElementChild;
    for (const label of [m.entries.columns.target, m.entries.columns.reason]) {
      expect(valueOf(label)?.className, label).toContain("truncate");
    }
    expect(valueOf(m.entries.columns.address)?.className).not.toContain("truncate");
  });
});

describe("the card as a control", () => {
  /**
   * :103 draws `<a href="#">` around the whole card. A button, for the reason Task 3 already
   * recorded for the table's own Open control (entries-plate.tsx): the entry has no address of its
   * own, and a link to nowhere is something a keyboard reaches and a screen reader announces as a
   * link that goes somewhere. The accessible name is the sheet's, unchanged.
   */
  it("is one control per entry, named exactly as the sheet names it", () => {
    render(cards());
    const controls = screen.getAllByRole("button");
    expect(controls).toHaveLength(2);
    expect(controls.map((one) => one.getAttribute("aria-label"))).toEqual([ASHA_LABEL, `Open the entry: Purged unconfirmed sign-ups at 02:00 ${ist}`]);
    for (const one of controls) expect(one.tagName).toBe("BUTTON");
  });

  it("holds no control inside itself, so the whole card is the one thing that opens", () => {
    render(cards());
    for (const card of screen.getAllByRole("button")) {
      expect(card.querySelectorAll("a, button, input, select, textarea")).toHaveLength(0);
    }
  });

  it("opens the entry it was pressed on, and no other", async () => {
    const onOpen = vi.fn();
    render(cards([ASHA, SYSTEM], onOpen));
    await userEvent.click(screen.getByRole("button", { name: ASHA_LABEL }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(ASHA);
  });
});
