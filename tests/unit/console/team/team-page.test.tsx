import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";
import type { Team, TeamMember } from "@/console/team/team";

// The Team page's own wiring of the last-Owner guard: which id it calls "the member reading this".
//
// The task-5 review set `signedInId={member.userId}` to `""` here and all 203 console tests stayed
// green -- every other test in this phase hands the guard its two inputs already worked out. Get
// this one wrong and an Owner opening their own row picks a role, types a reason and taps their key
// before the database tells them no, in words written for a developer. That is precisely the
// failure task-5-addendum.md §3 built a client-side guard to prevent, so the page's half of it is
// held here.
//
// ConsoleFrame is stood in for rather than rendered: it is an async server component that reads
// next/headers, so @testing-library/react cannot render it at all (its own note says so, and
// tests/unit/console/unavailable.test.tsx makes the same point). Nothing else is faked -- the real
// MembersPlate, the real MemberRowMenu, the real ChangeRoleDialog and the real guard all run.
const { requireConsoleMember, getTeam } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<() => Promise<ConsoleMember>>(),
  getTeam: vi.fn<() => Promise<Team>>(),
}));
vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/team/team", () => ({ getTeam }));
vi.mock("@/console/components/console-frame", () => ({ ConsoleFrame: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), redirect: vi.fn() }));

import TeamPage from "@/app/console/team/page";

const ASHA: ConsoleMember = {
  userId: "aaaaaaaa-0000-0000-0000-000000000001",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
};

function row(member: ConsoleMember): TeamMember {
  return { ...member, status: "active", keyCount: 2, lastActiveAt: "2026-09-21T08:32:00Z" };
}

// Two active Owners, so nothing here can be refused by the floor -- the only thing that can refuse
// Asha's own row is the page having told the guard who Asha is.
const DEVI: TeamMember = { ...row(ASHA), userId: "aaaaaaaa-0000-0000-0000-000000000005", email: "devi@trakline.in", name: "Devi Menon" };
const TEAM: Team = { members: [row(ASHA), DEVI], invites: [] };

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(ASHA);
  getTeam.mockReset().mockResolvedValue(TEAM);
});

/** Opens one row's menu and takes its first item, the way an Owner reaches the change-role flow. */
async function changeRoleOn(name: string): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: `Actions for ${name}` }));
  await user.click(await screen.findByRole("menuitem", { name: "Change role" }));
}

describe("the Team page's signed-in member", () => {
  it("reaches the row menu, so the reader's own row is refused as self", async () => {
    render(await TeamPage());
    await changeRoleOn("Asha Rao");
    expect(await screen.findByRole("alertdialog", { name: "A console needs at least one Owner" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  // The control: every other row on that same roster is changeable, so the refusal above is about
  // whose row it is and not about the page refusing Owners generally.
  it("leaves every other row changeable on the same roster", async () => {
    render(await TeamPage());
    await changeRoleOn("Devi Menon");
    expect(await screen.findByRole("radiogroup", { name: "New role" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
