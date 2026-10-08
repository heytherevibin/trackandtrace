import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseLeadFilters } from "@/console/leads/filters";
import type { LeadDetail } from "@/console/leads/leads";
import { consoleMessages } from "@/console/messages";

// The two acts behind a reason and a key: Delete lead and Export (sheet 22, part two). The real
// ConfirmItsYou (TC-01) renders; `runTap` is mocked at the ceremony boundary and the two requests at
// the network boundary, as the Team dialogs' tests are layered.
const { push, refresh, runTap, requestDelete, requestExport, success, error } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), runTap: vi.fn(), requestDelete: vi.fn(), requestExport: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));
vi.mock("@/console/leads/leads-client", () => ({ requestFind: vi.fn(), requestReveal: vi.fn(), requestTag: vi.fn(), requestNote: vi.fn(), requestDelete, requestExport }));
vi.mock("@/components/ui/toast", () => ({ notify: { success, error } }));

import { LeadExportButton, LeadExportProvider, LeadExportStatus } from "@/console/leads/lead-export";
import { LeadsBrowser } from "@/console/leads/leads-browser";

const m = consoleMessages.leads;
const REASON = "Asked by phone to be removed from our lists.";
const PRIYA = "p:a7777777-7777-4777-8777-777777777777";
const SIGNUP: LeadDetail = {
  id: PRIYA, email: "p•••@example.net", firstSeen: "2026-08-30T12:32:00+00:00",
  consents: [
    { list: "news", status: "subscribed", source: "footer", noticeVersion: "1.1", consentedAt: "2026-08-31T03:10:00+00:00", confirmedAt: "2026-08-31T03:11:00+00:00", withdrawnAt: null, withdrawReason: null },
    { list: "availability", status: "subscribed", source: "pre-booking", noticeVersion: "1.1", consentedAt: "2026-08-30T12:32:00+00:00", confirmedAt: "2026-08-30T12:34:00+00:00", withdrawnAt: null, withdrawReason: null },
  ],
  account: null,
  campaign: { source: "newsletter", medium: "email", name: "launch", firstPage: "/pre-booking" },
  timeline: [{ at: "2026-08-30T12:32:00+00:00", kind: "signed_up", list: "availability", source: "pre-booking", subject: null, reason: null }],
  tags: ["beta", "press"],
  notes: [],
  business: null,
};
const WITH_ACCOUNT: LeadDetail = { ...SIGNUP, account: { createdAt: "2026-09-05T04:00:00+00:00", lastSignInAt: null, disabled: false, emailLink: true, google: false, passkeys: 0, savedPnrs: 0 } };

const record = (detail: LeadDetail) => {
  render(<LeadsBrowser page={{ total: 0, rows: [] }} filters={parseLeadFilters({ lead: PRIYA, news: "subscribed" })} detail={detail} tags={[]} environment="production" members={[]} me="" />);
  return screen.getByRole("dialog", { name: m.record.title });
};
const tap = async () => {
  await userEvent.type(await screen.findByLabelText("Reason"), REASON);
  await userEvent.click(screen.getByRole("button", { name: "Tap your key" }));
};

beforeEach(() => {
  for (const fn of [push, refresh, runTap, requestDelete, requestExport, success, error]) fn.mockReset();
});

describe("Delete lead", () => {
  it("is offered for a lead with no account, and says what goes and what stays before asking for a key", async () => {
    const drawer = record(SIGNUP);
    expect(within(drawer).getByText(m.remove.detail)).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: m.remove.action }));
    expect(await screen.findByText("Form TC-01")).toBeInTheDocument();
    expect(screen.getByText(m.remove.summary("p•••@example.net"))).toBeInTheDocument();
    expect(screen.getByText("This removes the person, their 2 consents, 2 tags and 0 notes. A suppression on the address stays. They can sign up again.")).toBeInTheDocument();
    expect(requestDelete).not.toHaveBeenCalled();
  });

  it("is not offered for a lead with an account, and says why", () => {
    const drawer = record(WITH_ACCOUNT);
    expect(within(drawer).getByText(m.remove.hasAccount)).toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: m.remove.action })).not.toBeInTheDocument();
  });

  it("taps for exactly this lead under this deployment, deletes it, and goes back to the list", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    requestDelete.mockResolvedValue({ kind: "done" });
    const drawer = record(SIGNUP);
    await userEvent.click(within(drawer).getByRole("button", { name: m.remove.action }));
    await tap();
    expect(runTap).toHaveBeenCalledWith({ action: "Deleted a lead", target: PRIYA, value: '{"environment":"production"}', reason: REASON });
    await waitFor(() => expect(requestDelete).toHaveBeenCalledWith(PRIYA, '{"environment":"production"}', REASON));
    await waitFor(() => expect(success).toHaveBeenCalledWith(m.remove.done));
    expect(push).toHaveBeenCalledWith("/leads?news=subscribed");
    expect(refresh).toHaveBeenCalled();
  });

  it("deletes nothing when the key was not tapped", async () => {
    runTap.mockResolvedValue({ kind: "cancelled" });
    const drawer = record(SIGNUP);
    await userEvent.click(within(drawer).getByRole("button", { name: m.remove.action }));
    await tap();
    expect(requestDelete).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("says why a delete was refused, and leaves the record open", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    requestDelete.mockResolvedValue({ kind: "failed", message: m.remove.hasAccount });
    const drawer = record(SIGNUP);
    await userEvent.click(within(drawer).getByRole("button", { name: m.remove.action }));
    await tap();
    await waitFor(() => expect(error).toHaveBeenCalledWith(m.remove.hasAccount));
    expect(push).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });
});

describe("Export CSV", () => {
  const FILTERS = '{"account":null,"environment":"production","news":"subscribed","since":null,"source":null,"tag":"press"}';
  const page = (total: number | null) =>
    render(
      <LeadExportProvider filters={parseLeadFilters({ news: "subscribed", tag: "press", page: "2" })} environment="production" total={total}>
        <LeadExportButton />
        <LeadExportStatus />
      </LeadExportProvider>,
    );

  it("says how many leads and what the file holds, and asks for a reason and a key", async () => {
    page(1612);
    await userEvent.click(screen.getByRole("button", { name: m.export.action }));
    expect(await screen.findByText("Form TC-01")).toBeInTheDocument();
    expect(screen.getByText("Export 1,612 leads")).toBeInTheDocument();
    expect(screen.getByText(m.export.hint)).toBeInTheDocument();
    expect(requestExport).not.toHaveBeenCalled();
  });

  it("taps for the filters in force, prepares the file, and hands it over once", async () => {
    const created = vi.fn(() => "blob:leads");
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    runTap.mockResolvedValue({ kind: "done" });
    let finish: (value: unknown) => void = () => {};
    requestExport.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    page(431);
    await userEvent.click(screen.getByRole("button", { name: m.export.action }));
    await tap();
    expect(runTap).toHaveBeenCalledWith({ action: "Exported leads", target: "Leads", value: FILTERS, reason: REASON });
    await waitFor(() => expect(requestExport).toHaveBeenCalledWith(FILTERS, REASON));
    expect(screen.getByRole("status")).toHaveTextContent("Preparing export… 431 leads.");

    finish({ kind: "done", file: { csv: "﻿email\r\nasha.verma@example.com", count: 431, fileName: "leads-2026-09-19.csv" } });
    const ready = await screen.findByText("leads-2026-09-19.csv");
    expect(ready.closest("[role=status]")).toHaveTextContent(m.export.works);
    await userEvent.click(screen.getByRole("button", { name: m.export.download }));
    expect(created).toHaveBeenCalledTimes(1);
    // Once: the file is gone from the page the moment it is handed over.
    expect(screen.queryByRole("button", { name: m.export.download })).not.toBeInTheDocument();
    expect(screen.queryByText("leads-2026-09-19.csv")).not.toBeInTheDocument();
  });

  it("refuses more leads than one file may hold before asking for a key", async () => {
    page(10_001);
    await userEvent.click(screen.getByRole("button", { name: m.export.action }));
    expect(screen.getByRole("alert")).toHaveTextContent(m.export.tooMany(10_000));
    expect(screen.queryByText("Form TC-01")).not.toBeInTheDocument();
  });

  it("says there is nothing to export when the list could not be read", async () => {
    page(null);
    await userEvent.click(screen.getByRole("button", { name: m.export.action }));
    expect(screen.getByRole("alert")).toHaveTextContent(m.export.unavailable);
  });

  it("says why an export was refused", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    requestExport.mockResolvedValue({ kind: "failed", message: m.confirm.tapMismatch });
    page(431);
    await userEvent.click(screen.getByRole("button", { name: m.export.action }));
    await tap();
    expect(await screen.findByRole("alert")).toHaveTextContent(m.confirm.tapMismatch);
  });
});
