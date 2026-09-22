import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { consoleMessages } from "@/console/messages";
import { RolesPlate } from "@/console/team/roles-plate";

describe("RolesPlate", () => {
  it("titles the plate Roles", () => {
    render(<RolesPlate />);
    expect(screen.getByRole("heading", { name: "Roles" })).toBeInTheDocument();
  });

  it("draws the Module column heading, and each role as its own column heading", () => {
    render(<RolesPlate />);
    expect(screen.getByRole("columnheader", { name: "Module" })).toBeInTheDocument();
    for (const role of ["Owner", "Admin", "Support", "Viewer"]) {
      expect(screen.getByRole("columnheader", { name: role })).toBeInTheDocument();
    }
  });

  it("draws every module row, from Overview to My keys", () => {
    render(<RolesPlate />);
    expect(screen.getByRole("rowheader", { name: "01 Overview" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "12 Provider keys" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "13 Team" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "14 Audit log" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "My keys" })).toBeInTheDocument();
  });

  it("carries the three access-level legend chips, word for word", () => {
    render(<RolesPlate />);
    expect(screen.getByText("Full access")).toBeInTheDocument();
    expect(screen.getByText("Read-only or counts only")).toBeInTheDocument();
    expect(screen.getByText("No access")).toBeInTheDocument();
  });

  it("carries the four footnotes, including the one naming Owners", () => {
    render(<RolesPlate />);
    expect(screen.getByText("Only Owners manage the team and provider keys.")).toBeInTheDocument();
    expect(screen.getByText("Viewers see counts only, never personal data.")).toBeInTheDocument();
    expect(screen.getByText("Every member signs in with an email link and one of their keys.")).toBeInTheDocument();
    expect(
      screen.getByText("Support: Overview without urgent or recent actions, Leads without export, Privacy requests without email changes."),
    ).toBeInTheDocument();
  });

  it("marks Team (module 13) Owner-only, matching src/console/nav.ts's OWNER_ONLY", () => {
    render(<RolesPlate />);
    const teamRow = screen.getByRole("rowheader", { name: "13 Team" }).closest("tr");
    expect(teamRow).not.toBeNull();
    expect(within(teamRow!).getByRole("img", { name: "Owner: Full access" })).toBeInTheDocument();
    expect(within(teamRow!).getByRole("img", { name: "Admin: No access" })).toBeInTheDocument();
    expect(within(teamRow!).getByRole("img", { name: "Support: No access" })).toBeInTheDocument();
    expect(within(teamRow!).getByRole("img", { name: "Viewer: No access" })).toBeInTheDocument();
  });

  it("marks My keys full access for every role", () => {
    render(<RolesPlate />);
    const row = screen.getByRole("rowheader", { name: "My keys" }).closest("tr");
    expect(row).not.toBeNull();
    for (const cell of Array.from(row!.querySelectorAll("[role='img']"))) {
      expect(cell.getAttribute("aria-label")).toMatch(/: Full access$/);
    }
  });

  // task-3-brief.md bundles these four sentences with "the Roles plate", but ConsoleTeam.dc.html
  // actually draws them inside the Invite dialog's role picker (Task 4's dlg_invite), not this
  // plate's own table or footnotes -- see task-3-report.md. Authored once in en-IN/team.ts and
  // exported (not rendered here) because two other surfaces need the identical words: Task 4's
  // invite dialog, and the setup/redeem page's role-specific sub-line
  // (task-3-addendum.md §2's second gap, wired in src/app/console/setup/redeem-token.tsx).
  describe("the four role descriptions (shared copy, carried by the messages module Task 4 and the setup page import)", () => {
    it("matches ConsoleTeam.dc.html's own invite-dialog wording exactly", () => {
      expect(consoleMessages.team.roleDescription).toEqual({
        owner: "Everything, including the team and provider keys.",
        admin: "Everything except the team and provider keys.",
        support: "Overview, Leads, Privacy requests and Wrong-status reports.",
        viewer: "Counts and service status only, never personal data.",
      });
    });
  });
});
