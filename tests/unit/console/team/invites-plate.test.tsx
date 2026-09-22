import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The row actions are a client component with its own tests
// (tests/unit/console/team/invite-row-actions.test.tsx); here only their presence in the Actions
// cell matters, so next/navigation is stubbed rather than dragging a router into a plate test.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { InvitesPlate } from "@/console/team/invites-plate";
import type { TeamInvite } from "@/console/team/team";

const INVITES: readonly TeamInvite[] = [
  {
    id: "bbbbbbbb-0000-0000-0000-000000000001",
    email: "priya@trakline.in",
    role: "support",
    // 05:30 IST, still 19 Sep in IST -- chosen so the medium date formatter needs no day-boundary
    // reasoning to check by eye.
    sentAt: "2026-09-19T00:00:00Z",
    expiresAt: "2026-09-26T00:00:00Z",
  },
];

describe("InvitesPlate", () => {
  it("titles the plate Pending invites", () => {
    render(<InvitesPlate invites={INVITES} />);
    expect(screen.getByRole("heading", { name: "Pending invites" })).toBeInTheDocument();
  });

  // Five headers, the fifth visually hidden: ConsoleTeam.dc.html:163's own
  // `<th scope="col"><span style="position: absolute; …">Actions</span></th>`, the same shape the
  // Members table's own Actions header takes. Task 3 left this column out because it had nothing to
  // put in it (task-3-report.md); Task 7 is where the two buttons arrive.
  it("draws every column heading, Actions included", () => {
    render(<InvitesPlate invites={INVITES} />);
    for (const name of ["Email", "Role", "Sent", "Expires", "Actions"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
  });

  // ConsoleTeam.dc.html:163's own visually-hidden caption.
  it("names the accessible caption from the sheet", () => {
    render(<InvitesPlate invites={INVITES} />);
    expect(screen.getByRole("region", { name: "Invites waiting to be accepted" })).toBeInTheDocument();
  });

  it("lists the invite's email and role", () => {
    render(<InvitesPlate invites={INVITES} />);
    expect(screen.getByText("priya@trakline.in")).toBeInTheDocument();
    expect(screen.getByText("Support")).toBeInTheDocument();
  });

  it("formats Sent and Expires through the shared date formatter", () => {
    render(<InvitesPlate invites={INVITES} />);
    // formatDate's medium style: day, short month, year (utils/datetime.ts), IST throughout --
    // the same "Sept" abbreviation keys-plate.test.tsx already pins for this locale.
    expect(screen.getByText("19 Sept 2026")).toBeInTheDocument();
    expect(screen.getByText("26 Sept 2026")).toBeInTheDocument();
  });

  it("draws no row when there are no pending invites, rather than inventing an empty state the sheet never drew", () => {
    render(<InvitesPlate invites={[]} />);
    expect(screen.getByRole("heading", { name: "Pending invites" })).toBeInTheDocument();
    expect(screen.queryByText("priya@trakline.in")).not.toBeInTheDocument();
  });

  // Two inline ghost buttons per row, not a menu: the sheet draws the Members table's actions
  // behind a trigger and this table's in the open (task-7-addendum.md §2).
  it("gives every row its own Resend and Revoke, in the open rather than behind a menu", () => {
    render(
      <InvitesPlate
        invites={[...INVITES, { id: "bbbbbbbb-0000-0000-0000-000000000002", email: "nadia@trakline.in", role: "viewer", sentAt: "2026-09-20T00:00:00Z", expiresAt: "2026-09-27T00:00:00Z" }]}
      />,
    );
    expect(screen.getAllByRole("button", { name: "Resend" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(2);
    const row = screen.getByText("priya@trakline.in").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLTableRowElement).getByRole("button", { name: "Resend" })).toBeVisible();
  });

  // ConsoleTeamPhone.dc.html's own invites plate draws the address and a
  // "Support · sent … · expires …" legend and nothing else -- no Resend, no Revoke, under the same
  // "Open on a larger screen to manage the team." the members plate sits below. jsdom evaluates no
  // media query, so this asserts the marker `table-stack` keys its `display: none` off; the width
  // is proven in a real Chromium by tests/e2e/console-auth/scans.spec.ts.
  it("marks the Actions column as one the phone layout drops, and marks no other", () => {
    render(<InvitesPlate invites={INVITES} />);
    expect(screen.getByRole("columnheader", { name: "Actions" })).toHaveAttribute("data-phone-hidden");
    expect(screen.getByRole("button", { name: "Resend" }).closest("td")).toHaveAttribute("data-phone-hidden");
    for (const name of ["Email", "Role", "Sent", "Expires"]) {
      expect(screen.getByRole("columnheader", { name }), name).not.toHaveAttribute("data-phone-hidden");
    }
  });
});
