import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Removing a member (task-6, ConsoleTeam.dc.html's dlg_remove) and the sheet's own dlg_owner in
// front of it. Layered exactly as tests/unit/console/team/change-role-dialog.test.tsx is: the real
// ConfirmItsYou (TC-01) and the real LastOwnerNotice render, runTap is mocked at the ceremony
// boundary and removeMember at the network boundary.
const { removeMember } = vi.hoisted(() => ({ removeMember: vi.fn() }));
const { runTap } = vi.hoisted(() => ({ runTap: vi.fn() }));
const { notifySuccess } = vi.hoisted(() => ({ notifySuccess: vi.fn() }));
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/console/team/team-client", () => ({ removeMember }));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));
vi.mock("@/components/ui/toast", () => ({ notify: { success: notifySuccess, error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { RemoveMemberDialog } from "@/console/team/remove-member-dialog";
import type { TeamMember } from "@/console/team/team";

const REASON = "Left the support rota at the end of September.";

const ME = "aaaaaaaa-0000-0000-0000-000000000001";
const OWNER: TeamMember = {
  userId: ME,
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
  keyCount: 2,
  lastActiveAt: "2026-09-21T08:32:00Z",
};
const KIRAN: TeamMember = {
  userId: "d1111111-1111-1111-1111-111111111111",
  email: "kiran@trakline.in",
  name: "Kiran Das",
  role: "support",
  status: "active",
  keyCount: 2,
  lastActiveAt: "2026-09-21T08:32:00Z",
};
const SECOND_OWNER: TeamMember = {
  userId: "b1111111-1111-1111-1111-111111111111",
  email: "rohan@trakline.in",
  name: "Rohan Iyer",
  role: "owner",
  status: "active",
  keyCount: 3,
  lastActiveAt: "2026-09-21T08:32:00Z",
};

const onClose = vi.fn();
const onFailed = vi.fn();

function open(member: TeamMember, activeOwners = 2) {
  return render(<RemoveMemberDialog member={member} signedInId={ME} activeOwners={activeOwners} open onClose={onClose} onFailed={onFailed} />);
}

async function confirm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(await screen.findByLabelText("Reason"), REASON);
  await user.click(screen.getByRole("button", { name: "Tap your key" }));
}

beforeEach(() => {
  removeMember.mockReset();
  runTap.mockReset();
  notifySuccess.mockReset();
  refresh.mockReset();
  onClose.mockReset();
  onFailed.mockReset();
});

describe("RemoveMemberDialog on TC-01", () => {
  // ConsoleTeam.dc.html:313-325, word for word: the bold line takes the member's FULL name, the
  // hint their FIRST name only (task-6-addendum.md §2).
  it("draws the sheet's bold line and its hint, and no Change row at all", async () => {
    open(KIRAN);
    expect(await screen.findByText("Form TC-01")).toBeInTheDocument();
    expect(screen.getByText("Remove Kiran Das from the console")).toBeInTheDocument();
    expect(screen.getByText("Kiran is signed out everywhere at once.")).toBeInTheDocument();
    expect(screen.queryByText("Change")).toBeNull();
  });

  // `console.use_tap('Removed a member', p_member::text, v_target.role::text, p_reason)` -- the
  // value is the target's CURRENT role, the one the roster already shows, not a new one: nothing is
  // being chosen here (task-6-addendum.md §3).
  it("mints the tap over the member's id and the role they hold today", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    open(KIRAN);
    await confirm(userEvent.setup());
    await waitFor(() => expect(runTap).toHaveBeenCalledOnce());
    expect(runTap).toHaveBeenCalledWith({
      action: "Removed a member",
      target: "d1111111-1111-1111-1111-111111111111",
      value: "support",
      reason: REASON,
    });
  });

  it("removes the member once the tap is done, refreshes, closes and toasts", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    removeMember.mockResolvedValue({ kind: "done" });
    open(KIRAN);
    await confirm(userEvent.setup());
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith("d1111111-1111-1111-1111-111111111111", REASON));
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith("Member removed · logged"));
    expect(refresh).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
  });

  it("sends nothing when the tap is cancelled", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    open(KIRAN);
    await confirm(userEvent.setup());
    await waitFor(() => expect(runTap).toHaveBeenCalledOnce());
    expect(removeMember).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("hands a refusal up rather than toasting it, and refreshes the roster underneath", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    removeMember.mockResolvedValue({ kind: "failed", message: "The team has changed since this page loaded. Reload it and try again." });
    open(KIRAN);
    await confirm(userEvent.setup());
    await waitFor(() => expect(onFailed).toHaveBeenCalledWith("The team has changed since this page loaded. Reload it and try again."));
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });
});

// task-6-addendum.md §4. console_remove_member carries console_change_role's two refusals word for
// word -- the unconditional self-check and console.require_another_active_owner() -- so the sheet's
// own dlg_owner is drawn from the roster the page already holds, by the very predicate Task 5
// built. No second guard, and never by reading the database's message: it is a developer string
// arriving with the same 42501 as every other console refusal.
describe("RemoveMemberDialog's last-Owner guard", () => {
  function expectLastOwnerNotice(): void {
    expect(screen.getByRole("alertdialog", { name: "A console needs at least one Owner" })).toBeInTheDocument();
    expect(screen.getByText("Make someone else Owner first.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
    // No TC-01 behind it: there is nothing to confirm, because the console is saying no.
    expect(screen.queryByLabelText("Reason")).toBeNull();
    expect(runTap).not.toHaveBeenCalled();
    expect(removeMember).not.toHaveBeenCalled();
  }

  // `if p_member = v_member.user_id then raise` -- checked before the target row is even read, and
  // refused however many Owners stand ready.
  it("draws the sheet's own alertdialog for an Owner removing themselves", async () => {
    open(OWNER, 3);
    await screen.findByRole("alertdialog");
    expectLastOwnerNotice();
  });

  it("draws it for the console's last active Owner, without asking the server", async () => {
    open(SECOND_OWNER, 1);
    await screen.findByRole("alertdialog");
    expectLastOwnerNotice();
  });

  it("closes on OK", async () => {
    open(SECOND_OWNER, 1);
    await userEvent.setup().click(await screen.findByRole("button", { name: "OK" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("lets the same Owner be removed once a second active Owner stands", async () => {
    open(SECOND_OWNER, 2);
    expect(await screen.findByText("Remove Rohan Iyer from the console")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  // Unlike a role change, removal has no `is distinct from 'owner'` escape: the migration's
  // `if v_target.role = 'owner' then require_another_active_owner()` has no second condition.
  // Someone who is not an Owner is never held by the floor, whatever the Owner count.
  it("never holds back a member who is not an Owner", async () => {
    open(KIRAN, 1);
    expect(await screen.findByText("Remove Kiran Das from the console")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
