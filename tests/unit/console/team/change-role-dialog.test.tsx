import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Changing a role (task-5). Layered exactly as tests/unit/console/team/invite-dialog.test.tsx is:
// the real ConfirmItsYou (TC-01) renders, runTap is mocked at the ceremony boundary and changeRole
// at the network boundary, so what is under test is the wiring -- the undrawn picker, the drawn
// TC-01 body, and the last-Owner guard -- rather than WebAuthn or fetch.
const { changeRole } = vi.hoisted(() => ({ changeRole: vi.fn() }));
const { runTap } = vi.hoisted(() => ({ runTap: vi.fn() }));
const { notifySuccess } = vi.hoisted(() => ({ notifySuccess: vi.fn() }));
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/console/team/team-client", () => ({ changeRole }));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));
vi.mock("@/components/ui/toast", () => ({ notify: { success: notifySuccess, error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ChangeRoleDialog } from "@/console/team/change-role-dialog";
import type { TeamMember } from "@/console/team/team";

const REASON = "Covering switches for the weekend on-call.";

// The signed-in Owner reading the page, and the member whose row the menu was opened on. The
// sheet's own two names (ConsoleTeam.dc.html:114 and :265).
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

function open(member: TeamMember, activeOwners = 2) {
  return render(<ChangeRoleDialog member={member} signedInId={ME} activeOwners={activeOwners} open onClose={onClose} />);
}

beforeEach(() => {
  changeRole.mockReset();
  runTap.mockReset();
  notifySuccess.mockReset();
  refresh.mockReset();
  onClose.mockReset();
});

/** Picks a role in the undrawn picker, then runs TC-01's reason and tap. */
async function confirm(user: ReturnType<typeof userEvent.setup>, role: string): Promise<void> {
  await user.click(screen.getByRole("radio", { name: new RegExp(role) }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Reason"), REASON);
  await user.click(screen.getByRole("button", { name: "Tap your key" }));
}

describe("ChangeRoleDialog's picker", () => {
  // task-5-addendum.md §2: nothing on the sheet draws how the new role is chosen -- its `dialog`
  // enum goes straight from Row menu to TC-01 with "Support → Admin" already decided. This picker
  // is authored structure, and it names the member so the dialog is never about "a member".
  it("names the member in its title, in the same words TC-01 will use", async () => {
    open(KIRAN);
    expect(await screen.findByRole("heading", { name: "Change Kiran Das's role" })).toBeInTheDocument();
  });

  it("offers the other three roles with their shared descriptions, and never the member's own", async () => {
    open(KIRAN);
    expect(await screen.findByRole("radiogroup", { name: "New role" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    for (const name of ["Owner", "Admin", "Viewer"]) {
      expect(screen.getByRole("radio", { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.queryByRole("radio", { name: /Support/ })).not.toBeInTheDocument();
    // The four descriptions task-3 authored once at consoleMessages.team.roleDescription -- the
    // invite's picker and this one read the same copy, never a second wording.
    expect(screen.getByText("Everything, including the team and provider keys.")).toBeInTheDocument();
    expect(screen.getByText("Counts and service status only, never personal data.")).toBeInTheDocument();
  });

  // Nothing is pre-selected: the console has no business guessing which way an Owner meant to move
  // someone, and a wrong default on a risky action is the kind of thing that gets tapped through.
  it("starts with nothing chosen and Continue disabled, and enables it on a choice", async () => {
    open(KIRAN);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled());
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
    await user.click(screen.getByRole("radio", { name: /Admin/ }));
    expect(screen.getByRole("radio", { name: /Admin/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});

describe("ChangeRoleDialog on TC-01", () => {
  // ConsoleTeam.dc.html:265-267, word for word: the bold line takes the member's FULL name, the
  // hint takes their FIRST name only.
  it("draws the sheet's bold line, its before→after and its hint", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    open(KIRAN);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: /Admin/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Form TC-01")).toBeInTheDocument();
    expect(screen.getByText("Change Kiran Das's role")).toBeInTheDocument();
    expect(screen.getByText("Role: Support → Admin")).toBeInTheDocument();
    expect(screen.getByText("Kiran is signed out everywhere at once and signs in again with the new role.")).toBeInTheDocument();
  });

  // task-5-addendum.md §4: the tap is bound to the member's id as text, never their name or email,
  // and whatever the browser mints must be byte-identical to Postgres's own `p_member::text` --
  // lowercase canonical form, which is exactly what console_team returned for this row.
  it("mints the tap over the member's id and the new role, never their name", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    open(KIRAN);
    await confirm(userEvent.setup(), "Admin");
    await waitFor(() => expect(runTap).toHaveBeenCalledOnce());
    expect(runTap).toHaveBeenCalledWith({
      action: "Changed a role",
      target: "d1111111-1111-1111-1111-111111111111",
      value: "admin",
      reason: REASON,
    });
  });

  it("changes the role once the tap is done, refreshes the page, closes and toasts", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    changeRole.mockResolvedValue({ kind: "done" });
    open(KIRAN);
    await confirm(userEvent.setup(), "Admin");
    await waitFor(() => expect(changeRole).toHaveBeenCalledWith("d1111111-1111-1111-1111-111111111111", "admin", REASON));
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith("Role changed · logged"));
    expect(refresh).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
  });

  it("sends nothing when the tap is cancelled", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    open(KIRAN);
    await confirm(userEvent.setup(), "Viewer");
    await waitFor(() => expect(runTap).toHaveBeenCalledOnce());
    expect(changeRole).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("comes back to the picker with the chosen role still chosen when TC-01 is cancelled", async () => {
    open(KIRAN);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: /Viewer/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("radio", { name: /Viewer/ })).toBeChecked();
    expect(runTap).not.toHaveBeenCalled();
    expect(changeRole).not.toHaveBeenCalled();
  });

  // A refusal the server did send -- a stale tap, or the roster having moved underneath. It belongs
  // beside the control that would retry it, not in a toast that goes away.
  it("shows the server's own refusal back on the picker, and lets the same change be retried", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    changeRole.mockResolvedValueOnce({ kind: "failed", message: "That confirmation no longer matches this change. Try again." });
    changeRole.mockResolvedValue({ kind: "done" });
    open(KIRAN);
    const user = userEvent.setup();
    await confirm(user, "Admin");
    expect(await screen.findByRole("alert")).toHaveTextContent("That confirmation no longer matches this change. Try again.");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Tap your key" }));
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith("Role changed · logged"));
    expect(changeRole).toHaveBeenCalledTimes(2);
  });
});

// task-5-addendum.md §3. console_change_role raises one developer string ('a console needs at least
// one owner', errcode 42501) for two different cases, and a member must read the sheet's own
// dlg_owner instead -- decided here, from the roster the page already has, with no request at all.
describe("ChangeRoleDialog's last-Owner guard", () => {
  function expectLastOwnerNotice(): void {
    const alert = screen.getByRole("alertdialog", { name: "A console needs at least one Owner" });
    expect(alert).toBeInTheDocument();
    expect(screen.getByText("Make someone else Owner first.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
    // No picker, no TC-01: there is nothing to choose, because no choice could succeed.
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(runTap).not.toHaveBeenCalled();
    expect(changeRole).not.toHaveBeenCalled();
  }

  it("draws the sheet's own alertdialog for an Owner acting on their own row", async () => {
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

  it("lets the same Owner be demoted once a second active Owner stands", async () => {
    open(SECOND_OWNER, 2);
    expect(await screen.findByRole("radiogroup", { name: "New role" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
