import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The row menu (ConsoleTeam.dc.html:145 for its trigger, :193-199 for the menu itself). Task 5 owns
// the menu and its first item; Reset keys and Remove are Task 6's, and are drawn here inert so the
// menu the sheet draws exists once rather than being rebuilt around new items later
// (task-5-addendum.md §5).
const { changeRole } = vi.hoisted(() => ({ changeRole: vi.fn() }));
vi.mock("@/console/team/team-client", () => ({ changeRole }));
vi.mock("@/console/keys/tap-client", () => ({ runTap: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ notify: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { MemberRowMenu } from "@/console/team/member-row-menu";
import type { TeamMember } from "@/console/team/team";

const KIRAN: TeamMember = {
  userId: "d1111111-1111-1111-1111-111111111111",
  email: "kiran@trakline.in",
  name: "Kiran Das",
  role: "support",
  status: "active",
  keyCount: 2,
  lastActiveAt: "2026-09-21T08:32:00Z",
};

beforeEach(() => {
  changeRole.mockReset();
});

function draw() {
  return render(<MemberRowMenu member={KIRAN} signedInId="aaaaaaaa-0000-0000-0000-000000000001" activeOwners={2} />);
}

/** Opens the menu and waits for its content -- Base UI positions it asynchronously. */
async function openMenu(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Actions for Kiran Das" }));
  await screen.findByRole("menuitem", { name: "Change role" });
  return user;
}

describe("MemberRowMenu", () => {
  it("names its trigger after the member, exactly as the sheet draws it", () => {
    draw();
    expect(screen.getByRole("button", { name: "Actions for Kiran Das" })).toBeInTheDocument();
  });

  it("opens the sheet's three items, in the sheet's own order", async () => {
    draw();
    await openMenu();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Change role", "Reset keys", "Remove"]);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  // :194 gives the open menu the very same `aria-label` as the trigger that opened it, so a screen
  // reader hears which member's actions these are. Asserted rather than assumed: the menu takes its
  // name from the trigger, which is only true while the trigger has one of its own.
  it("carries the member's name onto the open menu too", async () => {
    draw();
    await openMenu();
    expect(screen.getByRole("menu", { name: "Actions for Kiran Das" })).toBeInTheDocument();
  });

  // Task 6's two, present so the menu is transcribed once, inert so neither pretends to work.
  it("leaves Reset keys and Remove inert for Task 6", async () => {
    draw();
    await openMenu();
    expect(screen.getByRole("menuitem", { name: "Reset keys" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Remove" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Change role" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("opens the change-role flow from its first item", async () => {
    draw();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Change role" }));
    expect(await screen.findByRole("heading", { name: "Change Kiran Das's role" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "New role" })).toBeInTheDocument();
  });

  it("opens nothing until its first item is used", () => {
    draw();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
