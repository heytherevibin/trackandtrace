import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Pending invites table's two row actions (task-7, ConsoleTeam.dc.html's dlg_resend and
// dlg_revoke). Layered exactly as tests/unit/console/team/reset-keys-dialog.test.tsx is: the real
// ConfirmDialog and the real ConfirmItsYou render, runTap is mocked at the ceremony boundary and
// the two client calls at the network boundary, so what is under test is the wiring -- which dialog
// each button opens, what the revoke's tap is minted over, and where a refusal goes -- rather than
// WebAuthn or fetch.
const { resendInvite, revokeInvite } = vi.hoisted(() => ({ resendInvite: vi.fn(), revokeInvite: vi.fn() }));
const { runTap } = vi.hoisted(() => ({ runTap: vi.fn() }));
const { notifySuccess } = vi.hoisted(() => ({ notifySuccess: vi.fn() }));
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/console/team/team-client", () => ({ resendInvite, revokeInvite }));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));
vi.mock("@/components/ui/toast", () => ({ notify: { success: notifySuccess, error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { InviteRowActions } from "@/console/team/invite-row-actions";
import type { TeamInvite } from "@/console/team/team";

const REASON = "Sent it to the wrong address entirely.";

const PRIYA: TeamInvite = {
  id: "bbbbbbbb-0000-0000-0000-000000000001",
  email: "priya@example.com",
  role: "support",
  sentAt: "2026-09-19T00:00:00Z",
  expiresAt: "2026-09-26T00:00:00Z",
};

// Expired: created eight days ago, expired yesterday. console_team still lists it -- nothing prunes
// a live-but-expired invite -- and it is the row an Owner most needs Resend for.
const EXPIRED: TeamInvite = { ...PRIYA, id: "bbbbbbbb-0000-0000-0000-000000000002", sentAt: "2026-09-12T00:00:00Z", expiresAt: "2026-09-19T00:00:00Z" };

function open(invite: TeamInvite = PRIYA) {
  return render(<InviteRowActions invite={invite} />);
}

beforeEach(() => {
  resendInvite.mockReset();
  revokeInvite.mockReset();
  runTap.mockReset();
  notifySuccess.mockReset();
  refresh.mockReset();
});

describe("InviteRowActions: the two buttons the sheet draws", () => {
  // ConsoleTeam.dc.html:163 -- two inline `btn btn-ghost btn-sm` buttons in the Actions cell, not
  // the row menu the Members table beside it uses (task-7-addendum.md §2).
  it("draws Resend and Revoke as plain buttons, with no menu to open first", () => {
    open();
    expect(screen.getByRole("button", { name: "Resend" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  });

  it("opens neither dialog until a button is pressed", () => {
    open();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByText("Form TC-01")).toBeNull();
  });
});

describe("Resend", () => {
  // dlg_resend (:347-357), word for word, with the address interpolated where the sheet mocks
  // priya@example.com. A plain alertdialog and nothing else: resending re-sends a letter to an
  // address an Owner already approved and changes no access, so it takes no tap -- and
  // console_resend_invite has no p_reason to spend one with.
  it("opens the sheet's own alertdialog -- title, detail, Cancel and Resend -- with no reason field and no tap", async () => {
    open();
    await userEvent.setup().click(screen.getByRole("button", { name: "Resend" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Resend the invite?")).toBeVisible();
    expect(within(dialog).getByText("priya@example.com gets a new link that lasts 7 days. The old link stops working.")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Resend" })).toBeVisible();
    // TC-01's own two marks: no ceremony here at all.
    expect(screen.queryByText("Form TC-01")).toBeNull();
    expect(screen.queryByLabelText("Reason")).toBeNull();
  });

  it("interpolates whichever address that row actually holds", async () => {
    open({ ...PRIYA, email: "nadia@trakline.in" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Resend" }));
    expect(await screen.findByText("nadia@trakline.in gets a new link that lasts 7 days. The old link stops working.")).toBeVisible();
  });

  it("resends the invite by id once confirmed, says so, and refreshes the list", async () => {
    resendInvite.mockResolvedValue({ kind: "done" });
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Resend" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Resend" }));
    await waitFor(() => expect(resendInvite).toHaveBeenCalledWith("bbbbbbbb-0000-0000-0000-000000000001"));
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith("Invite resent · logged"));
    expect(refresh).toHaveBeenCalledOnce();
    expect(runTap).not.toHaveBeenCalled();
  });

  it("sends nothing when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Resend" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(resendInvite).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  // task-7-brief.md's own last test is backwards: it asks that an expired invite cannot be resent.
  // The opposite is deliberate and the migration says so in as many words
  // (20260922090000_console_team.sql, console_resend_invite's own comment, task-7-addendum.md §1):
  // console_invites_live_email_idx holds the address while an invite is neither accepted nor
  // revoked, and expiry does not release it -- so refusing to resend would leave an Owner unable to
  // resend *and* unable to invite that address again. Resend is the recovery path, so nothing here
  // disables it for an expired row.
  it("offers Resend on an expired invite too -- that is how an Owner recovers one", async () => {
    resendInvite.mockResolvedValue({ kind: "done" });
    const user = userEvent.setup();
    open(EXPIRED);
    const trigger = screen.getByRole("button", { name: "Resend" });
    expect(trigger).toBeEnabled();
    await user.click(trigger);
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Resend" }));
    await waitFor(() => expect(resendInvite).toHaveBeenCalledWith("bbbbbbbb-0000-0000-0000-000000000002"));
  });

  // The dialog has already closed by the time a refusal comes back, exactly as TC-01 has for the
  // member row actions, so it lands in the row's own alert rather than a toast -- a notice that
  // goes away is the wrong shape for something a member has to act on (member-row-menu.tsx's own
  // note).
  it("shows a refusal in the row rather than toasting it, and re-reads the list", async () => {
    resendInvite.mockResolvedValue({ kind: "failed", message: "The team has changed since this page loaded. Reload it and try again." });
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Resend" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Resend" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The team has changed since this page loaded. Reload it and try again.");
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("clears a refusal the moment either dialog is opened again", async () => {
    resendInvite.mockResolvedValue({ kind: "failed", message: "The team has changed since this page loaded. Reload it and try again." });
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Resend" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Resend" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

describe("Revoke", () => {
  /** TC-01 is the whole dialog here: the sheet's two lines, plus the reason and the tap it demands. */
  async function confirm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    open();
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await user.type(await screen.findByLabelText("Reason"), REASON);
    await user.click(screen.getByRole("button", { name: "Tap your key" }));
  }

  // The sheet draws dlg_revoke as a plain alertdialog with no reason and no tap, but
  // `console_revoke_invite` calls console.use_tap('Revoked an invite', …) and requires both. The
  // database is shipped and is the security boundary, and the plan's own ruling is that revoking
  // withdraws granted access and so takes a tap -- so both drawn lines are carried into TC-01 as
  // its summary and its hint, and nothing the sheet wrote is lost (task-7-addendum.md §3).
  it("opens TC-01 carrying the sheet's own two lines, and no Change row", async () => {
    open();
    await userEvent.setup().click(screen.getByRole("button", { name: "Revoke" }));
    expect(await screen.findByText("Form TC-01")).toBeInTheDocument();
    expect(screen.getByText("Revoke the invite?")).toBeVisible();
    expect(screen.getByText("The link sent to priya@example.com stops working at once.")).toBeVisible();
    // No before-and-after pair to show, the same shape dlg_reset and dlg_remove already take --
    // which is why `change` is optional at all (task-6-addendum.md §1).
    expect(screen.queryByText("Change")).toBeNull();
    expect(await screen.findByLabelText("Reason")).toBeVisible();
  });

  // `console.use_tap('Revoked an invite', p_invite::text, v_invite.email, p_reason)`: the invite's
  // own id -- Postgres's lowercase canonical uuid, byte for byte what console_team returned -- and
  // the address, never the role. A mismatch means every revoke fails with "no tap for this action"
  // and nothing on screen says why (task-7-addendum.md §4).
  it("mints the tap over the invite's id and its address", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    await confirm(userEvent.setup());
    await waitFor(() => expect(runTap).toHaveBeenCalledOnce());
    expect(runTap).toHaveBeenCalledWith({
      action: "Revoked an invite",
      target: "bbbbbbbb-0000-0000-0000-000000000001",
      value: "priya@example.com",
      reason: REASON,
    });
  });

  it("revokes the invite once the tap is done, says so, and refreshes so the row goes", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    revokeInvite.mockResolvedValue({ kind: "done" });
    await confirm(userEvent.setup());
    await waitFor(() => expect(revokeInvite).toHaveBeenCalledWith("bbbbbbbb-0000-0000-0000-000000000001", REASON));
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith("Invite revoked · logged"));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("sends nothing when the tap is cancelled", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    await confirm(userEvent.setup());
    await waitFor(() => expect(runTap).toHaveBeenCalledOnce());
    expect(revokeInvite).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sends nothing and closes when TC-01 is cancelled outright", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Form TC-01")).toBeNull());
    expect(runTap).not.toHaveBeenCalled();
    expect(revokeInvite).not.toHaveBeenCalled();
  });

  it("shows a refusal in the row rather than toasting it, and re-reads the list", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    revokeInvite.mockResolvedValue({ kind: "failed", message: "That confirmation no longer matches this invite. Try again." });
    await confirm(userEvent.setup());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That confirmation no longer matches this invite. Try again.");
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  // The reason is what the tap is minted over, so a second opening must never inherit the first
  // attempt's words -- ConfirmItsYou resets its own stage on open, and the reason lives here.
  it("starts the reason empty each time it opens", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await user.type(await screen.findByLabelText("Reason"), REASON);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(await screen.findByLabelText("Reason")).toHaveValue("");
  });
});
