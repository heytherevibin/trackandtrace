import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The only-you row carries InviteDialog and every row now carries MemberRowMenu, both "use client"
// units that call useRouter for their post-mutation router.refresh(). Outside an app router there
// is no router to find, so the hook is stood in for here; the two units' own behaviour is tested in
// tests/unit/console/team/invite-dialog.test.tsx and member-row-menu.test.tsx, and what this file
// proves is only that each is rendered where the sheet draws it.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

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
    render(<MembersPlate members={ALL} signedInId={OWNER.userId} />);
    expect(screen.getByRole("heading", { name: "Members" })).toBeInTheDocument();
    expect(screen.getByText("3 members")).toBeInTheDocument();
  });

  it("pluralises a single member correctly", () => {
    render(<MembersPlate members={[OWNER]} signedInId={OWNER.userId} />);
    expect(screen.getByText("1 member")).toBeInTheDocument();
  });

  it("draws every column heading, including the visually-hidden Actions one", () => {
    render(<MembersPlate members={ALL} signedInId={OWNER.userId} />);
    for (const name of ["Name", "Email", "Role", "Keys", "Last active", "Status", "Actions"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
  });

  it("lists each member's name, email and role", () => {
    render(<MembersPlate members={ALL} signedInId={OWNER.userId} />);
    expect(screen.getByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByText("asha@trakline.in")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Viewer")).toBeInTheDocument();
  });

  it("draws Active for an active member and Setup incomplete for one still in setup", () => {
    render(<MembersPlate members={ALL} signedInId={OWNER.userId} />);
    expect(screen.getAllByText("Active")).toHaveLength(2);
    expect(screen.getByText("Setup incomplete")).toBeInTheDocument();
  });

  it("shows a plain key count for an active member", () => {
    render(<MembersPlate members={ALL} signedInId={OWNER.userId} />);
    expect(screen.getByText("2 keys")).toBeInTheDocument();
    expect(screen.getByText("3 keys")).toBeInTheDocument();
  });

  it("appends the setup-incomplete note to a setup member's key count, as the sheet draws it", () => {
    render(<MembersPlate members={ALL} signedInId={OWNER.userId} />);
    expect(screen.getByText("1 key · setup incomplete")).toBeInTheDocument();
  });

  it("shows a bare time for last-active today, and a relative phrase for an older day", () => {
    render(<MembersPlate members={ALL} signedInId={OWNER.userId} />);
    expect(screen.getByText("14:02 IST")).toBeInTheDocument();
    expect(screen.getByText("09:40 IST")).toBeInTheDocument();
    expect(screen.getByText("3 days ago")).toBeInTheDocument();
  });

  it("reads a member who has never been active as Never, not a formatting crash", () => {
    render(<MembersPlate members={[OWNER, NEVER_ACTIVE]} signedInId={OWNER.userId} />);
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  // ConsoleTeam.dc.html:145 draws one trigger per row, named after that row's member. Task 3 left
  // every Actions cell empty on purpose; task 5 fills it with the menu the sheet draws.
  it("gives every row its own Actions trigger, named after that row's member", () => {
    render(<MembersPlate members={ALL} signedInId={OWNER.userId} />);
    for (const member of ALL) {
      expect(screen.getByRole("button", { name: `Actions for ${member.name}` })).toBeInTheDocument();
    }
  });

  // The whole reason a role change only calls router.refresh(): the plate is a server component
  // with no list state of its own, so the roster it is handed is the roster it draws, and a
  // refreshed one cannot disagree with the first paint (task-4-addendum.md §5, Ruling 14).
  it("draws the role it is handed, so a refreshed roster shows the new one", () => {
    const { rerender } = render(<MembersPlate members={[OWNER, ADMIN]} signedInId={OWNER.userId} />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
    rerender(<MembersPlate members={[OWNER, { ...ADMIN, role: "viewer" }]} signedInId={OWNER.userId} />);
    expect(screen.getByText("Viewer")).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("draws the sheet's only-you note when there is exactly one member, and not otherwise", () => {
    const { rerender } = render(<MembersPlate members={[OWNER]} signedInId={OWNER.userId} />);
    expect(screen.getByText("You're the only member.")).toBeInTheDocument();
    rerender(<MembersPlate members={ALL} signedInId={OWNER.userId} />);
    expect(screen.queryByText("You're the only member.")).not.toBeInTheDocument();
  });

  // ConsoleTeam.dc.html:157 draws a second "Invite a member" beside that note -- a secondary
  // button, unlike the primary one in the page header (:106). Task 3 built neither on purpose,
  // because the string and the dialog behind it are Task 4's (task-3-report.md).
  it("draws the only-you row's own secondary Invite trigger beside the note", () => {
    render(<MembersPlate members={[OWNER]} signedInId={OWNER.userId} />);
    expect(screen.getByRole("button", { name: "Invite a member" })).toBeInTheDocument();
  });
});
