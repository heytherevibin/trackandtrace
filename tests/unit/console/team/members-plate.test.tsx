import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MembersPlate } from "@/console/team/members-plate";
import type { TeamMember } from "@/console/team/team";

// createdAt/lastActiveAt values chosen so formatTime's IST conversion (UTC+5:30) lands on the
// sheet's own round numbers, the same discipline tests/unit/console/account/sessions-plate.test.tsx
// uses -- easy to eyeball in the assertions below rather than trusting a conversion done twice.
const NOW = new Date("2026-09-21T18:00:00Z"); // 23:30 IST, 21 Sep 2026

const OWNER: TeamMember = {
  userId: "aaaaaaaa-0000-0000-0000-000000000001",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
  keyCount: 2,
  lastActiveAt: "2026-09-21T08:32:00Z", // 14:02 IST, same IST day as NOW
};
const ADMIN: TeamMember = {
  userId: "aaaaaaaa-0000-0000-0000-000000000002",
  email: "rohan@trakline.in",
  name: "Rohan Iyer",
  role: "admin",
  status: "active",
  keyCount: 3,
  lastActiveAt: "2026-09-18T08:32:00Z", // three IST days before NOW
};
const SETUP_VIEWER: TeamMember = {
  userId: "aaaaaaaa-0000-0000-0000-000000000003",
  email: "meera@trakline.in",
  name: "Meera Nair",
  role: "viewer",
  status: "setup",
  keyCount: 1,
  lastActiveAt: "2026-09-21T04:10:00Z", // 09:40 IST, same IST day as NOW
};
// Not on the sheet's own mocked rows (every one already has a last-active moment), but a member who
// accepted an invite and never signed in with a key genuinely has no session at all --
// console_team's own last_active_at (max(sessions.last_seen_at)) is null for them.
const NEVER_ACTIVE: TeamMember = {
  userId: "aaaaaaaa-0000-0000-0000-000000000004",
  email: "kiran@trakline.in",
  name: "Kiran Das",
  role: "support",
  status: "setup",
  keyCount: 0,
  lastActiveAt: null,
};

const ALL: readonly TeamMember[] = [OWNER, ADMIN, SETUP_VIEWER];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MembersPlate", () => {
  it("titles the plate Members and counts the members", () => {
    render(<MembersPlate members={ALL} />);
    expect(screen.getByRole("heading", { name: "Members" })).toBeInTheDocument();
    expect(screen.getByText("3 members")).toBeInTheDocument();
  });

  it("pluralises a single member correctly", () => {
    render(<MembersPlate members={[OWNER]} />);
    expect(screen.getByText("1 member")).toBeInTheDocument();
  });

  it("draws every column heading, including the visually-hidden Actions one", () => {
    render(<MembersPlate members={ALL} />);
    for (const name of ["Name", "Email", "Role", "Keys", "Last active", "Status", "Actions"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
  });

  it("lists each member's name, email and role", () => {
    render(<MembersPlate members={ALL} />);
    expect(screen.getByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByText("asha@trakline.in")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Viewer")).toBeInTheDocument();
  });

  it("draws Active for an active member and Setup incomplete for one still in setup", () => {
    render(<MembersPlate members={ALL} />);
    expect(screen.getAllByText("Active")).toHaveLength(2);
    expect(screen.getByText("Setup incomplete")).toBeInTheDocument();
  });

  it("shows a plain key count for an active member", () => {
    render(<MembersPlate members={ALL} />);
    expect(screen.getByText("2 keys")).toBeInTheDocument();
    expect(screen.getByText("3 keys")).toBeInTheDocument();
  });

  it("appends the setup-incomplete note to a setup member's key count, as the sheet draws it", () => {
    render(<MembersPlate members={ALL} />);
    expect(screen.getByText("1 key · setup incomplete")).toBeInTheDocument();
  });

  it("shows a bare time for last-active today, and a relative phrase for an older day", () => {
    render(<MembersPlate members={ALL} />);
    expect(screen.getByText("14:02 IST")).toBeInTheDocument();
    expect(screen.getByText("09:40 IST")).toBeInTheDocument();
    expect(screen.getByText("3 days ago")).toBeInTheDocument();
  });

  it("reads a member who has never been active as Never, not a formatting crash", () => {
    render(<MembersPlate members={[OWNER, NEVER_ACTIVE]} />);
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("leaves every Actions cell empty -- the row menu is a later task's", () => {
    render(<MembersPlate members={ALL} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("draws the sheet's only-you note when there is exactly one member, and not otherwise", () => {
    const { rerender } = render(<MembersPlate members={[OWNER]} />);
    expect(screen.getByText("You're the only member.")).toBeInTheDocument();
    rerender(<MembersPlate members={ALL} />);
    expect(screen.queryByText("You're the only member.")).not.toBeInTheDocument();
  });
});
