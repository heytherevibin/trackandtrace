import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

  it("draws every column heading", () => {
    render(<InvitesPlate invites={INVITES} />);
    for (const name of ["Email", "Role", "Sent", "Expires"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
  });

  // ConsoleTeam.dc.html:163's own visually-hidden caption, transcribed rather than the brief's
  // "Actions" column: the brief lists no Actions header for this plate (unlike Members), matching
  // the sheet, which has no Row-menu-equivalent for invites in this task -- Resend/Revoke are
  // Task 7's (task-3-report.md).
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
});
