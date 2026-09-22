import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Resetting a member's keys (task-6, ConsoleTeam.dc.html's dlg_reset). Layered exactly as
// tests/unit/console/team/change-role-dialog.test.tsx is: the real ConfirmItsYou (TC-01) renders,
// runTap is mocked at the ceremony boundary and resetKeys at the network boundary, so what is under
// test is the wiring -- the drawn TC-01 body, the digest the tap is minted over, and what happens
// to the count that comes back -- rather than WebAuthn or fetch.
const { resetKeys } = vi.hoisted(() => ({ resetKeys: vi.fn() }));
const { runTap } = vi.hoisted(() => ({ runTap: vi.fn() }));
const { notifySuccess } = vi.hoisted(() => ({ notifySuccess: vi.fn() }));
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/console/team/team-client", () => ({ resetKeys }));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));
vi.mock("@/components/ui/toast", () => ({ notify: { success: notifySuccess, error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ResetKeysDialog } from "@/console/team/reset-keys-dialog";
import type { TeamMember } from "@/console/team/team";

const REASON = "Lost a security key on the train.";

const KIRAN: TeamMember = {
  userId: "d1111111-1111-1111-1111-111111111111",
  email: "kiran@trakline.in",
  name: "Kiran Das",
  role: "support",
  status: "active",
  keyCount: 2,
  lastActiveAt: "2026-09-21T08:32:00Z",
};

const onClose = vi.fn();
const onFailed = vi.fn();

function open(member: TeamMember = KIRAN) {
  return render(<ResetKeysDialog member={member} open onClose={onClose} onFailed={onFailed} />);
}

/** TC-01 is the whole dialog here: there is nothing to choose first, unlike the role change. */
async function confirm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(await screen.findByLabelText("Reason"), REASON);
  await user.click(screen.getByRole("button", { name: "Tap your key" }));
}

beforeEach(() => {
  resetKeys.mockReset();
  runTap.mockReset();
  notifySuccess.mockReset();
  refresh.mockReset();
  onClose.mockReset();
  onFailed.mockReset();
});

describe("ResetKeysDialog on TC-01", () => {
  // ConsoleTeam.dc.html:288-300, word for word: the bold line takes the member's FULL name, the
  // hint their FIRST name only -- the same split dlg_role draws (task-6-addendum.md §2).
  it("draws the sheet's bold line and its hint, and no Change row at all", async () => {
    open();
    expect(await screen.findByText("Form TC-01")).toBeInTheDocument();
    expect(screen.getByText("Reset Kiran Das's keys")).toBeInTheDocument();
    expect(screen.getByText("Kiran is signed out everywhere and will add two new keys at next sign-in.")).toBeInTheDocument();
    // dlg_reset draws no Change row, unlike dlg_role beside it (task-6-addendum.md §1).
    expect(screen.queryByText("Change")).toBeNull();
  });

  // The migration counts the member's keys inside its own transaction and digests that count:
  // `select count(*) into v_count …; perform console.use_tap('Reset a member''s keys',
  // p_member::text, v_count::text, p_reason)`. The browser must mint over the count it rendered --
  // console_team's own key_count for this row -- so the two agree unless the member's keys actually
  // moved in between (task-6-addendum.md §3).
  it("mints the tap over the member's id and the key count it rendered", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    open();
    await confirm(userEvent.setup());
    await waitFor(() => expect(runTap).toHaveBeenCalledOnce());
    expect(runTap).toHaveBeenCalledWith({
      action: "Reset a member's keys",
      target: "d1111111-1111-1111-1111-111111111111",
      value: "2",
      reason: REASON,
    });
  });

  it("mints over whatever count that row actually shows, never a fixed two", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    open({ ...KIRAN, keyCount: 3 });
    await confirm(userEvent.setup());
    await waitFor(() => expect(runTap).toHaveBeenCalledOnce());
    expect(runTap).toHaveBeenCalledWith(expect.objectContaining({ value: "3" }));
  });

  // task-6-brief.md: "a reset reports how many keys went". console_reset_keys returns that integer
  // and the toast is where it lands -- authored copy, flagged `Not drawn` in the messages file.
  it("resets the keys once the tap is done, reports how many went, refreshes and closes", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    resetKeys.mockResolvedValue({ kind: "done", count: 2 });
    open();
    await confirm(userEvent.setup());
    await waitFor(() => expect(resetKeys).toHaveBeenCalledWith("d1111111-1111-1111-1111-111111111111", REASON));
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith("2 keys removed · logged"));
    expect(refresh).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
  });

  // The count comes from the server, not from the row: the database recounts inside its own
  // transaction, and a toast that repeated the page's number would be reporting what the console
  // guessed rather than what actually happened.
  it("reports the server's count, not the row's, and says 'key' for one", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    resetKeys.mockResolvedValue({ kind: "done", count: 1 });
    open({ ...KIRAN, keyCount: 3 });
    await confirm(userEvent.setup());
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith("1 key removed · logged"));
  });

  it("sends nothing when the tap is cancelled", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    open();
    await confirm(userEvent.setup());
    await waitFor(() => expect(runTap).toHaveBeenCalledOnce());
    expect(resetKeys).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sends nothing and closes when TC-01 is cancelled outright", async () => {
    open();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(runTap).not.toHaveBeenCalled();
    expect(resetKeys).not.toHaveBeenCalled();
  });

  // TC-01 has already closed by the time a refusal comes back -- onConfirmed fires the moment the
  // tap verifies, before the DELETE this dialog then sends -- so there is no dialog left to show it
  // in, exactly as src/console/account/keys-plate.tsx found for Remove. It goes up to the owner of
  // the dialog, which keeps it on screen beside the control that would retry it.
  it("hands a refusal up rather than toasting it, and refreshes so the next attempt has the true count", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    resetKeys.mockResolvedValue({
      kind: "failed",
      message: "That confirmation no longer matches this member's keys. Their keys changed since this page loaded; reload it and try again.",
    });
    open();
    await confirm(userEvent.setup());
    await waitFor(() =>
      expect(onFailed).toHaveBeenCalledWith(
        "That confirmation no longer matches this member's keys. Their keys changed since this page loaded; reload it and try again.",
      ),
    );
    expect(notifySuccess).not.toHaveBeenCalled();
    // The stale count is exactly what the digest mismatch was about, so the roster is re-read all
    // the same -- leaving it stale would have the next attempt mint over the same wrong number and
    // fail in exactly the same way (the reasoning keys-plate.tsx spells out for its own re-read).
    expect(refresh).toHaveBeenCalledOnce();
  });
});
