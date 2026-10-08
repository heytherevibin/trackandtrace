import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountDetail } from "@/console/accounts/accounts";
import { parseAccountFilters } from "@/console/accounts/filters";
import { consoleMessages } from "@/console/messages";

// The three acts behind a reason and a key: Sign out everywhere, Disable and Enable (sheet 24).
// The real ConfirmItsYou (TC-01) renders; `runTap` is mocked at the ceremony boundary and the
// request at the network boundary, as the Leads acts' tests are layered.
const { push, refresh, runTap, requestAccountAct, success, error } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), runTap: vi.fn(), requestAccountAct: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));
vi.mock("@/console/accounts/accounts-client", () => ({ requestFindAccount: vi.fn(), requestRevealAccount: vi.fn(), requestAccountAct }));
vi.mock("@/components/ui/toast", () => ({ notify: { success, error } }));

import { AccountsBrowser } from "@/console/accounts/accounts-browser";

const m = consoleMessages.accounts;
const a = m.acts;
const REASON = "Reported a lost phone and asked us to sign it out.";
const VALUE = '{"environment":"production"}';
const ASHA = "c1111111-1111-4111-8111-111111111111";
const ACTIVE: AccountDetail = {
  id: ASHA, email: "a•••@example.com", createdAt: "2026-09-05T04:00:00+00:00", lastSignInAt: "2026-09-18T15:42:00+00:00",
  emailLink: true, google: false, passkeys: 1, savedPnrs: 3, news: "subscribed", disabled: false, leadId: `a:${ASHA}`,
  sessions: { count: 2, lastSeenAt: "2026-09-19T02:35:00+00:00" }, disabledAt: null, disabledBy: null,
};
const DISABLED: AccountDetail = { ...ACTIVE, disabled: true, sessions: { count: 0, lastSeenAt: null }, disabledAt: "2026-09-18T10:35:00+00:00", disabledBy: "Asha Rao" };

const record = (detail: AccountDetail) => {
  render(<AccountsBrowser page={{ total: 0, rows: [] }} filters={parseAccountFilters({ account: ASHA, status: "active" })} detail={detail} environment="production" />);
  return screen.getByRole("dialog", { name: m.record.title });
};
const tap = async () => {
  await userEvent.type(await screen.findByLabelText("Reason"), REASON);
  await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
};

beforeEach(() => {
  for (const fn of [push, refresh, runTap, requestAccountAct, success, error]) fn.mockReset();
});

describe("Sign out everywhere", () => {
  it("says what it does, and how many sessions it ends, before asking for a key", async () => {
    const drawer = record(ACTIVE);
    expect(within(drawer).getByText(a.signOut.detail)).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: a.signOut.action }));
    expect(await screen.findByText("Form TC-01")).toBeInTheDocument();
    expect(screen.getByText(a.signOut.summary("a•••@example.com"))).toBeInTheDocument();
    expect(screen.getByText("This ends their 2 sessions on every device, now. They can sign in again straight away.")).toBeInTheDocument();
    expect(requestAccountAct).not.toHaveBeenCalled();
  });

  it("taps for exactly this account under this deployment, signs it out, and reads the page again", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    requestAccountAct.mockResolvedValue({ kind: "done" });
    const drawer = record(ACTIVE);
    await userEvent.click(within(drawer).getByRole("button", { name: a.signOut.action }));
    await tap();
    expect(runTap).toHaveBeenCalledWith({ action: "Signed an account out everywhere", target: ASHA, value: VALUE, reason: REASON });
    await waitFor(() => expect(requestAccountAct).toHaveBeenCalledWith("signOut", ASHA, VALUE, REASON));
    await waitFor(() => expect(success).toHaveBeenCalledWith(a.signOut.done));
    expect(refresh).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("has no button when nobody is signed in, and says so", () => {
    const drawer = record({ ...ACTIVE, sessions: { count: 0, lastSeenAt: null } });
    expect(within(drawer).getByText(a.signOut.nobody)).toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: a.signOut.action })).not.toBeInTheDocument();
  });

  it("does nothing when the key ceremony is cancelled", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    const drawer = record(ACTIVE);
    await userEvent.click(within(drawer).getByRole("button", { name: a.signOut.action }));
    await tap();
    await waitFor(() => expect(runTap).toHaveBeenCalled());
    expect(requestAccountAct).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says why the database refused, and leaves the record as it was", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    requestAccountAct.mockResolvedValue({ kind: "failed", message: a.errors.nobody });
    const drawer = record(ACTIVE);
    await userEvent.click(within(drawer).getByRole("button", { name: a.signOut.action }));
    await tap();
    await waitFor(() => expect(error).toHaveBeenCalledWith(a.errors.nobody));
    expect(success).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("Disable and Enable", () => {
  it("offers Disable on an active account, and says what is kept before asking for a key", async () => {
    const drawer = record(ACTIVE);
    expect(within(drawer).getByText(a.disable.detail)).toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: a.enable.action })).not.toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: a.disable.action }));
    expect(await screen.findByText(a.disable.summary("a•••@example.com"))).toBeInTheDocument();
    expect(screen.getByText(a.disable.hint)).toBeInTheDocument();
  });

  it("taps for exactly this account, disables it, and reads the page again", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    requestAccountAct.mockResolvedValue({ kind: "done" });
    const drawer = record(ACTIVE);
    await userEvent.click(within(drawer).getByRole("button", { name: a.disable.action }));
    await tap();
    expect(runTap).toHaveBeenCalledWith({ action: "Disabled an account", target: ASHA, value: VALUE, reason: REASON });
    await waitFor(() => expect(requestAccountAct).toHaveBeenCalledWith("disable", ASHA, VALUE, REASON));
    await waitFor(() => expect(success).toHaveBeenCalledWith(a.disable.done));
    expect(refresh).toHaveBeenCalled();
  });

  it("says since when a disabled account can't sign in and by whom, and offers Enable in place of Disable", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    requestAccountAct.mockResolvedValue({ kind: "done" });
    const drawer = record(DISABLED);
    expect(within(drawer).getByText(/^Can't sign in since 18 Sept? 2026, 16:05 IST\. Disabled by Asha Rao\.$/)).toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: a.disable.action })).not.toBeInTheDocument();
    expect(within(drawer).getByText(a.signOut.nobody)).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: a.enable.action }));
    expect(await screen.findByText(a.enable.summary("a•••@example.com"))).toBeInTheDocument();
    await tap();
    expect(runTap).toHaveBeenCalledWith({ action: "Enabled an account", target: ASHA, value: VALUE, reason: REASON });
    await waitFor(() => expect(requestAccountAct).toHaveBeenCalledWith("enable", ASHA, VALUE, REASON));
    await waitFor(() => expect(success).toHaveBeenCalledWith(a.enable.done));
  });

  it("says only that an account disabled from outside the console can't sign in", () => {
    const drawer = record({ ...DISABLED, disabledAt: null, disabledBy: null });
    expect(within(drawer).getByText(m.record.cannotSignIn)).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: a.enable.action })).toBeInTheDocument();
  });
});

describe("on a phone", () => {
  it("keeps the acts off the phone board, and says where to make changes instead", () => {
    const drawer = record(ACTIVE);
    // The acts are drawn from `sm` up only; the line that replaces them is drawn below it only.
    expect(within(drawer).getByRole("button", { name: a.disable.action }).closest(".max-sm\\:hidden")).not.toBeNull();
    expect(within(drawer).getByRole("button", { name: a.signOut.action }).closest(".max-sm\\:hidden")).not.toBeNull();
    expect(within(drawer).getByText(m.record.largerScreen).className).toContain("sm:hidden");
  });
});
