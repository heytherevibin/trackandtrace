import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Form TC-04 (docs/design/sheets/console/ConsoleTeam.dc.html:203-259). The layering here matches
// tests/unit/console/account/keys-plate.test.tsx: the real ConfirmItsYou (TC-01) renders, runTap is
// mocked at the ceremony boundary, and inviteMember is mocked at the network boundary -- so what is
// actually under test is the wiring between the three, not WebAuthn or fetch.
const { inviteMember } = vi.hoisted(() => ({ inviteMember: vi.fn() }));
const { runTap } = vi.hoisted(() => ({ runTap: vi.fn() }));
const { notifySuccess } = vi.hoisted(() => ({ notifySuccess: vi.fn() }));
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/console/team/team-client", () => ({ inviteMember }));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));
vi.mock("@/components/ui/toast", () => ({ notify: { success: notifySuccess, error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { InviteDialog } from "@/console/team/invite-dialog";

const REASON = "Priya is covering weekend leads.";

beforeEach(() => {
  inviteMember.mockReset();
  runTap.mockReset();
  notifySuccess.mockReset();
  refresh.mockReset();
});

/** Opens TC-04 and fills the address in. Leaves the role on the sheet's own default. */
async function openWith(address: string): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Invite a member" }));
  await user.type(screen.getByLabelText("Email"), address);
  return user;
}

/** TC-04 Continue, then TC-01's reason and tap. */
async function confirm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Reason"), REASON);
  await user.click(screen.getByRole("button", { name: "Tap your key" }));
}

describe("InviteDialog", () => {
  it("draws the trigger the sheet gives it, and opens Form TC-04 with the sheet's own copy", async () => {
    render(<InviteDialog variant="primary" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Invite a member" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Form TC-04")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByText("The invite lasts 7 days. It can't go to an address that already has a Trakline account.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  // ConsoleTeam.dc.html:214-219: a radiogroup labelled by "Role", four radios, each with a name and
  // the description task-3 authored once at consoleMessages.team.roleDescription.
  it("draws the four roles as a radiogroup, with Support checked as the sheet draws it", async () => {
    render(<InviteDialog variant="primary" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Invite a member" }));
    expect(screen.getByRole("radiogroup", { name: "Role" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: /Support/ })).toBeChecked();
    for (const description of [
      "Everything, including the team and provider keys.",
      "Everything except the team and provider keys.",
      "Overview, Leads, Privacy requests and Wrong-status reports.",
      "Counts and service status only, never personal data.",
    ]) {
      expect(screen.getByText(description)).toBeInTheDocument();
    }
  });

  it("refuses an address that is not an address, without calling the server", async () => {
    render(<InviteDialog variant="primary" />);
    const user = await openWith("priya");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter an email address like name@example.com.");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(inviteMember).not.toHaveBeenCalled();
    expect(runTap).not.toHaveBeenCalled();
  });

  it("mints the tap over the lower-cased address, the role and the reason -- exactly what the database re-digests", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    render(<InviteDialog variant="primary" />);
    const user = await openWith("Priya@Example.com");
    await confirm(user);
    await waitFor(() => expect(runTap).toHaveBeenCalledOnce());
    expect(runTap).toHaveBeenCalledWith({ action: "Invited a member", target: "priya@example.com", value: "support", reason: REASON });
  });

  it("sends the invite once the tap is done, refreshes the page, and shows the sheet's toast", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    inviteMember.mockResolvedValue({ kind: "done" });
    render(<InviteDialog variant="primary" />);
    const user = await openWith("priya@example.com");
    await confirm(user);
    await waitFor(() => expect(inviteMember).toHaveBeenCalledWith("priya@example.com", "support", REASON));
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith("Invite sent · logged"));
    expect(refresh).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("sends the role the member picked, not the default one", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    inviteMember.mockResolvedValue({ kind: "done" });
    render(<InviteDialog variant="primary" />);
    const user = await openWith("priya@example.com");
    await user.click(screen.getByRole("radio", { name: /Admin/ }));
    await confirm(user);
    await waitFor(() => expect(inviteMember).toHaveBeenCalledWith("priya@example.com", "admin", REASON));
    expect(runTap).toHaveBeenCalledWith(expect.objectContaining({ value: "admin" }));
  });

  // The address that already belongs to a member: the database raises a developer string
  // ('that address already belongs to a member'), the route translates it, and this dialog shows
  // what it was sent -- never the raw text.
  it("shows the database's translated refusal for an address that is already a member, not its raw text", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    inviteMember.mockResolvedValue({ kind: "failed", message: "This address already belongs to a console member.", boundToAddress: true });
    render(<InviteDialog variant="primary" />);
    const user = await openWith("devi@trakline.in");
    await confirm(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This address already belongs to a console member.");
    expect(screen.queryByText(/that address already belongs to a member/)).not.toBeInTheDocument();
    // dlg_refused (:236-238, :257): the field is marked invalid and described by the alert, and
    // Continue is disabled until the address changes.
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-describedby", alert.id);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("draws the sheet's own alert for an address that already has a Trakline account", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    inviteMember.mockResolvedValue({
      kind: "failed",
      message: "This address already has a Trakline account. Invite a dedicated console address.",
      boundToAddress: true,
    });
    render(<InviteDialog variant="primary" />);
    const user = await openWith("priya.shah@example.com");
    await confirm(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("This address already has a Trakline account. Invite a dedicated console address.");
  });

  // A stale tap and an unreachable console both invite a retry with the very same address, so
  // neither may latch the field or disable the only control that retries -- and neither has
  // anything to say about the address, so neither may mark it invalid.
  it("leaves Continue enabled and the address unmarked when the refusal is not about the address", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    inviteMember.mockResolvedValue({
      kind: "failed",
      message: "That confirmation no longer matches this invite. Try inviting them again.",
      boundToAddress: false,
    });
    render(<InviteDialog variant="primary" />);
    const user = await openWith("priya@example.com");
    await confirm(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("That confirmation no longer matches this invite. Try inviting them again.");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Email")).toHaveValue("priya@example.com");
  });

  it("lets that retry actually run, on the same address, without an edit", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    inviteMember.mockResolvedValueOnce({
      kind: "failed",
      message: "That confirmation no longer matches this invite. Try inviting them again.",
      boundToAddress: false,
    });
    inviteMember.mockResolvedValue({ kind: "done" });
    render(<InviteDialog variant="primary" />);
    const user = await openWith("priya@example.com");
    await confirm(user);
    await screen.findByRole("alert");
    await confirm(user);
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith("Invite sent · logged"));
    expect(inviteMember).toHaveBeenCalledTimes(2);
  });

  it("lets a refused address be edited, which re-enables Continue", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    inviteMember.mockResolvedValue({
      kind: "failed",
      message: "This address already has a Trakline account. Invite a dedicated console address.",
      boundToAddress: true,
    });
    render(<InviteDialog variant="primary" />);
    const user = await openWith("priya.shah@example.com");
    await confirm(user);
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled());
    await user.type(screen.getByLabelText("Email"), "x");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends nothing when the tap is cancelled", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    render(<InviteDialog variant="primary" />);
    const user = await openWith("priya@example.com");
    await confirm(user);
    await waitFor(() => expect(runTap).toHaveBeenCalledOnce());
    expect(inviteMember).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sends nothing when the member closes the confirmation instead of tapping", async () => {
    render(<InviteDialog variant="primary" />);
    const user = await openWith("priya@example.com");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Confirm it's you" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(runTap).not.toHaveBeenCalled();
    expect(inviteMember).not.toHaveBeenCalled();
    // Back on TC-04 with the address still typed, rather than thrown away.
    expect(await screen.findByLabelText("Email")).toHaveValue("priya@example.com");
  });
});
