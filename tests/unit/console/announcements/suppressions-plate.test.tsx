import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Suppression } from "@/console/announcements/suppressions";
import { consoleMessages } from "@/console/messages";

const { refresh, requestReveal, requestLift, success, error } = vi.hoisted(() => ({ refresh: vi.fn(), requestReveal: vi.fn(), requestLift: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/console/announcements/letters-client", () => ({ requestReveal, requestLift }));
vi.mock("@/components/ui/toast", () => ({ notify: { success, error } }));

import { AnnouncementsTabs } from "@/console/announcements/announcements-tabs";
import { SuppressionsPlate } from "@/console/announcements/suppressions-plate";

// ---------------------------------------------------------------------------
// ConsoleAnnouncements.dc.html, Suppressions and both Lift confirms; and the
// phone board's cards. The sheet's rule: an address is masked until revealed,
// and nobody lifts a suppression for an address they cannot see.
// ---------------------------------------------------------------------------

const m = consoleMessages.announcements.suppressions;
const row = (over: Partial<Suppression>): Suppression => ({ id: "a0000000-0000-4000-8000-000000000001", address: "r•••@example.com", masked: true, operator: false, scope: "all", reason: "hard bounce", at: "2026-09-16T04:11:00+00:00", ...over });
const OPERATOR = row({ id: "a0000000-0000-4000-8000-000000000000", address: "kiran@example.com", masked: false, operator: true, at: "2026-09-17T05:50:00+00:00" });
const READER = row({});
const COMPLAINT = row({ id: "a0000000-0000-4000-8000-000000000002", address: "s•••@example.com", scope: "list", reason: "complaint", at: "2026-09-15T12:33:00+00:00" });
const DELAYED = row({ id: "a0000000-0000-4000-8000-000000000003", address: "a•••@example.com", scope: "list", reason: "repeatedly delayed", at: "2026-09-12T01:42:00+00:00" });
const PROVIDER = row({ id: "a0000000-0000-4000-8000-000000000004", address: "p•••@example.com", scope: "list", reason: "suppressed by Resend", at: "2026-09-09T11:00:00+00:00" });
const ALL = [OPERATOR, READER, COMPLAINT, DELAYED, PROVIDER];

const table = () => screen.getByRole("table", { name: m.caption });
const tableRow = (address: string) => within(table()).getByRole("row", { name: new RegExp(address.replace(/[.•]/g, "\\$&")) });
const cards = () => screen.getByRole("list", { name: m.caption });

beforeEach(() => {
  for (const fn of [refresh, requestReveal, requestLift, success, error]) fn.mockReset();
});

describe("the table", () => {
  it("draws each row with the sheet's words for its scope, reason and source, and never the provider's name", () => {
    render(<SuppressionsPlate rows={ALL} />);
    expect(screen.getByText("5 addresses")).toBeInTheDocument();
    const complaint = tableRow("s•••@example.com");
    expect(within(complaint).getByText(m.scopes.list)).toBeInTheDocument();
    expect(within(complaint).getByText(m.reasons.complaint)).toBeInTheDocument();
    expect(within(complaint).getByText(m.sources.complaint)).toBeInTheDocument();
    expect(within(tableRow("p•••@example.com")).getByText(m.sources.provider)).toBeInTheDocument();
    expect(table().textContent ?? "").not.toMatch(/resend/i);
  });

  it("marks an operator's row, shows its address whole, and lets it be lifted without a reveal", () => {
    render(<SuppressionsPlate rows={ALL} />);
    const operator = tableRow("kiran@example.com");
    expect(within(operator).getByText(m.operator)).toBeInTheDocument();
    expect(within(operator).queryByRole("button", { name: m.revealLabel("kiran@example.com") })).not.toBeInTheDocument();
    expect(within(operator).getByRole("button", { name: m.liftLabel("kiran@example.com") })).toBeEnabled();
  });

  it("keeps Lift off on a masked row, and says to reveal the address first", () => {
    render(<SuppressionsPlate rows={ALL} />);
    const reader = tableRow("r•••@example.com");
    const lift = within(reader).getByRole("button", { name: m.liftLabelMasked("r•••@example.com") });
    expect(lift).toBeDisabled();
    expect(lift).toHaveAttribute("title", m.liftFirst);
    expect(within(reader).getByRole("button", { name: m.revealLabel("r•••@example.com") })).toBeEnabled();
  });

  it("reveals an address on request, in the table and the cards alike, and then lets it be lifted", async () => {
    requestReveal.mockResolvedValue({ kind: "done", address: "reader@example.com" });
    render(<SuppressionsPlate rows={ALL} />);
    await userEvent.click(within(tableRow("r•••@example.com")).getByRole("button", { name: m.revealLabel("r•••@example.com") }));
    expect(requestReveal).toHaveBeenCalledWith(READER.id);
    const revealed = tableRow("reader@example.com");
    expect(within(revealed).queryByRole("button", { name: /Reveal/ })).not.toBeInTheDocument();
    expect(within(revealed).getByRole("button", { name: m.liftLabel("reader@example.com") })).toBeEnabled();
    expect(within(cards()).getByText("reader@example.com")).toBeInTheDocument();
  });

  it("shows why a reveal failed and leaves the row masked", async () => {
    requestReveal.mockResolvedValue({ kind: "failed", message: m.errors.gone });
    render(<SuppressionsPlate rows={ALL} />);
    await userEvent.click(within(tableRow("r•••@example.com")).getByRole("button", { name: m.revealLabel("r•••@example.com") }));
    expect(error).toHaveBeenCalledWith(m.errors.gone);
    expect(tableRow("r•••@example.com")).toBeInTheDocument();
  });
});

describe("Lift", () => {
  it("asks first, naming the address and scope and what resumes, then lifts with the address it showed", async () => {
    requestLift.mockResolvedValue({ kind: "done" });
    render(<SuppressionsPlate rows={ALL} />);
    await userEvent.click(within(tableRow("kiran@example.com")).getByRole("button", { name: m.liftLabel("kiran@example.com") }));
    const dialog = screen.getByRole("alertdialog", { name: m.liftDialog.title });
    expect(within(dialog).getByText("kiran@example.com")).toBeInTheDocument();
    expect(within(dialog).getByText(m.scopes.all)).toBeInTheDocument();
    expect(within(dialog).getByText(/^Mail to this address resumes: sign-in links, confirmations and letters\. It was suppressed on 17 Sep.* after a hard bounce/)).toBeInTheDocument();
    expect(requestLift).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: m.liftDialog.confirm }));
    expect(requestLift).toHaveBeenCalledWith(OPERATOR.id, "kiran@example.com");
    expect(success).toHaveBeenCalledWith(m.liftDialog.done);
    expect(refresh).toHaveBeenCalled();
  });

  it("for a row from the mail service's own list, says lifting ours does not lift theirs", async () => {
    requestReveal.mockResolvedValue({ kind: "done", address: "p.mehta@example.com" });
    render(<SuppressionsPlate rows={ALL} />);
    await userEvent.click(within(tableRow("p•••@example.com")).getByRole("button", { name: m.revealLabel("p•••@example.com") }));
    await userEvent.click(within(tableRow("p.mehta@example.com")).getByRole("button", { name: m.liftLabel("p.mehta@example.com") }));
    const dialog = screen.getByRole("alertdialog", { name: m.liftDialog.title });
    expect(within(dialog).getByText(m.sources.provider)).toBeInTheDocument();
    expect(within(dialog).getByText(/^Lifting ours does not lift the mail service's own list, which suppressed this address on 0?9 Sep/)).toBeInTheDocument();
  });

  it("for a List mail row, says letters resume and nothing wider", async () => {
    requestReveal.mockResolvedValue({ kind: "done", address: "sam@example.com" });
    render(<SuppressionsPlate rows={ALL} />);
    await userEvent.click(within(tableRow("s•••@example.com")).getByRole("button", { name: m.revealLabel("s•••@example.com") }));
    await userEvent.click(within(tableRow("sam@example.com")).getByRole("button", { name: m.liftLabel("sam@example.com") }));
    expect(within(screen.getByRole("alertdialog")).getByText(/^Letters to this address resume\. It was suppressed on 15 Sep.* after a spam complaint\./)).toBeInTheDocument();
  });

  it("shows why a lift failed, and redraws: the row may already be gone", async () => {
    requestLift.mockResolvedValue({ kind: "failed", message: m.errors.gone });
    render(<SuppressionsPlate rows={ALL} />);
    await userEvent.click(within(tableRow("kiran@example.com")).getByRole("button", { name: m.liftLabel("kiran@example.com") }));
    await userEvent.click(screen.getByRole("button", { name: m.liftDialog.confirm }));
    expect(error).toHaveBeenCalledWith(m.errors.gone);
    expect(refresh).toHaveBeenCalled();
  });
});

describe("the phone's cards", () => {
  it("draw each address with Reveal, and no Lift at all", () => {
    render(<SuppressionsPlate rows={ALL} />);
    const list = cards();
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(within(list).getByRole("button", { name: m.revealLabel("r•••@example.com") })).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: /Lift/ })).not.toBeInTheDocument();
    expect(screen.getByText(m.phoneNotes[0]!)).toBeInTheDocument();
  });
});

describe("empty and unread", () => {
  it("says nobody is suppressed", () => {
    render(<SuppressionsPlate rows={[]} />);
    expect(screen.getByText(m.none)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says the list could not be read, never that it is empty", () => {
    render(<SuppressionsPlate rows={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(m.unavailable);
    expect(screen.queryByText(m.none)).not.toBeInTheDocument();
  });
});

describe("AnnouncementsTabs", () => {
  it("is two links, with the current one marked as the page", () => {
    render(<AnnouncementsTabs current="suppressions" />);
    const nav = screen.getByRole("navigation", { name: consoleMessages.announcements.tabs.label });
    expect(within(nav).getByRole("link", { name: "Letters" })).toHaveAttribute("href", "/announcements");
    expect(within(nav).getByRole("link", { name: "Letters" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Suppressions" })).toHaveAttribute("href", "/announcements/suppressions");
    expect(within(nav).getByRole("link", { name: "Suppressions" })).toHaveAttribute("aria-current", "page");
  });
});
