import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { leadQuery, parseLeadFilters } from "@/console/leads/filters";
import type { LeadBusiness, LeadDetail } from "@/console/leads/leads";
import { consoleMessages } from "@/console/messages";

// Business leads on the page (sheet 22, part three): form TC-09 from the page header, and the
// Business enquiry section that ends a lead's record. None of it needs a key.
const { push, refresh, requestAddBusiness, requestMarkBusiness, requestMoveBusiness, requestAssignBusiness, requestUnmarkBusiness, success, error } = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(), requestAddBusiness: vi.fn(), requestMarkBusiness: vi.fn(), requestMoveBusiness: vi.fn(), requestAssignBusiness: vi.fn(), requestUnmarkBusiness: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/console/leads/leads-client", () => ({
  requestFind: vi.fn(), requestReveal: vi.fn(), requestTag: vi.fn(), requestNote: vi.fn(), requestDelete: vi.fn(), requestExport: vi.fn(),
  requestAddBusiness, requestMarkBusiness, requestMoveBusiness, requestAssignBusiness, requestUnmarkBusiness,
}));
vi.mock("@/components/ui/toast", () => ({ notify: { success, error } }));

import { AddBusinessLead } from "@/console/leads/business-lead-dialog";
import { LeadsBrowser } from "@/console/leads/leads-browser";

const m = consoleMessages.leads;
const b = m.business;
const KIRAN = "33333333-3333-4333-8333-333333333333";
const ASHA = "11111111-1111-4111-8111-111111111111";
const MEMBERS = [{ id: ASHA, name: "Asha Rao" }, { id: KIRAN, name: "Kiran Das" }];
const MEERA = "p:a8888888-8888-4888-8888-888888888888";
const ENTRY: LeadBusiness = { stage: "new", stageSince: "2026-09-17T05:50:00+00:00", ownerId: KIRAN, ownerName: "Kiran Das", name: "Meera Pillai", organisation: "Acme Travel", about: "Travel desk, about 40 bookings a month" };
const BY_HAND: LeadDetail = {
  id: MEERA, email: "m•••@acme-travel.example", firstSeen: "2026-09-17T05:50:00+00:00", consents: [], account: null, campaign: null,
  timeline: [{ at: "2026-09-17T05:50:00+00:00", kind: "added_by_hand", list: null, source: null, subject: null, reason: null, by: "Kiran Das" }],
  tags: [], notes: [], business: ENTRY,
};
const SIGN_UP: LeadDetail = {
  ...BY_HAND, id: "p:a2222222-2222-4222-8222-222222222222", email: "s•••@example.com", business: null,
  timeline: [{ at: "2026-09-17T05:50:00+00:00", kind: "signed_up", list: "news", source: "footer", subject: null, reason: null }],
  consents: [{ list: "news", status: "pending", source: "footer", noticeVersion: "1.1", consentedAt: "2026-09-17T05:50:00+00:00", confirmedAt: null, withdrawnAt: null, withdrawReason: null }],
};

const record = (detail: LeadDetail) => {
  render(<LeadsBrowser page={{ total: 0, rows: [] }} filters={parseLeadFilters({ lead: detail.id })} detail={detail} tags={[]} environment="production" members={MEMBERS} me={ASHA} />);
  return screen.getByRole("dialog", { name: m.record.title });
};
const section = (drawer: HTMLElement) => within(drawer).getByRole("heading", { name: b.section }).parentElement as HTMLElement;

beforeEach(() => {
  for (const fn of [push, refresh, requestAddBusiness, requestMarkBusiness, requestMoveBusiness, requestAssignBusiness, requestUnmarkBusiness, success, error]) fn.mockReset();
});

describe("Add a business lead (TC-09)", () => {
  const open = async () => {
    render(<AddBusinessLead members={MEMBERS} me={ASHA} page={leadQuery(parseLeadFilters({ news: "pending" }))} />);
    await userEvent.click(screen.getByRole("button", { name: b.add }));
    return screen.getByRole("dialog", { name: b.add });
  };
  const fill = async (form: HTMLElement, email: string, about: string) => {
    await userEvent.type(within(form).getByLabelText(b.email), email);
    if (about) await userEvent.type(within(form).getByLabelText(b.about), about);
  };

  it("draws the form: an email, an optional name and organisation, one line about them, and an owner who is you by default", async () => {
    const form = await open();
    expect(within(form).getByText(b.form)).toBeInTheDocument();
    for (const label of [b.email, b.name, b.organisation, b.about]) expect(within(form).getByLabelText(label)).toHaveValue("");
    const owner = within(form).getByLabelText(b.owner) as HTMLSelectElement;
    expect(Array.from(owner.options).map((o) => o.textContent)).toEqual(["Asha Rao", "Kiran Das"]);
    expect(owner).toHaveValue(ASHA);
    expect(within(form).getByText(b.addLegend)).toBeInTheDocument();
    expect(within(form).getByText(b.aboutHint)).toBeInTheDocument();
  });

  it("adds the lead, says so, and opens its record over the list as it was filtered", async () => {
    requestAddBusiness.mockResolvedValue({ kind: "done", id: MEERA, added: true });
    const form = await open();
    await fill(form, "  Meera.Pillai@Acme-Travel.example ", "Travel desk, about 40 bookings a month");
    await userEvent.type(within(form).getByLabelText(b.name), "Meera Pillai");
    await userEvent.selectOptions(within(form).getByLabelText(b.owner), KIRAN);
    await userEvent.click(within(form).getByRole("button", { name: b.addAction }));
    expect(requestAddBusiness).toHaveBeenCalledWith("meera.pillai@acme-travel.example", { name: "Meera Pillai", organisation: "", about: "Travel desk, about 40 bookings a month", owner: KIRAN });
    await waitFor(() => expect(success).toHaveBeenCalledWith(b.added));
    expect(push).toHaveBeenCalledWith(`/leads?news=pending&lead=${encodeURIComponent(MEERA)}`);
    expect(refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: b.add })).not.toBeInTheDocument());
  });

  it("says when the address was already a lead, and opens that lead", async () => {
    requestAddBusiness.mockResolvedValue({ kind: "done", id: SIGN_UP.id, added: false });
    const form = await open();
    await fill(form, "someone@example.com", "Asked about group bookings");
    await userEvent.click(within(form).getByRole("button", { name: b.addAction }));
    await waitFor(() => expect(success).toHaveBeenCalledWith(b.existing));
    expect(push).toHaveBeenCalledWith(`/leads?news=pending&lead=${encodeURIComponent(SIGN_UP.id)}`);
  });

  it("refuses part of an address, and a form with nothing about the lead, without a request", async () => {
    const form = await open();
    await fill(form, "meera", "Travel desk");
    await userEvent.click(within(form).getByRole("button", { name: b.addAction }));
    expect(within(form).getByRole("alert")).toHaveTextContent(m.errors.notAddress);
    await userEvent.clear(within(form).getByLabelText(b.email));
    await userEvent.clear(within(form).getByLabelText(b.about));
    await fill(form, "meera@acme-travel.example", "");
    await userEvent.click(within(form).getByRole("button", { name: b.addAction }));
    expect(within(form).getByRole("alert")).toHaveTextContent(b.errors.aboutEmpty);
    expect(requestAddBusiness).not.toHaveBeenCalled();
  });

  it("says why an add was refused, and keeps the form as it was typed", async () => {
    requestAddBusiness.mockResolvedValue({ kind: "failed", message: b.errors.member });
    const form = await open();
    await fill(form, "kiran@trakline.in", "A colleague");
    await userEvent.click(within(form).getByRole("button", { name: b.addAction }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(b.errors.member);
    expect(within(form).getByLabelText(b.email)).toHaveValue("kiran@trakline.in");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("Business enquiry, on the record", () => {
  it("shows a business lead's stage, owner, name, organisation and the line about it", () => {
    const part = section(record(BY_HAND));
    expect(within(part).getByRole("combobox", { name: b.stage })).toHaveValue("new");
    expect(within(part).getByRole("combobox", { name: b.owner })).toHaveValue(KIRAN);
    for (const text of ["Meera Pillai", "Acme Travel", "Travel desk, about 40 bookings a month"]) expect(within(part).getByText(text)).toBeInTheDocument();
  });

  it("says who added a lead by hand, and that it is kept until it is deleted", () => {
    const drawer = record(BY_HAND);
    expect(within(drawer).getByText("Added by hand by Kiran Das")).toBeInTheDocument();
    expect(within(drawer).getByText(b.kept)).toBeInTheDocument();
    expect(within(drawer).queryByText(m.record.retention)).not.toBeInTheDocument();
  });

  it("moves a lead with the Stage picker, and shows the stage the server answered", async () => {
    requestMoveBusiness.mockResolvedValue({ kind: "done", business: { ...ENTRY, stage: "contacted" } });
    const part = section(record(BY_HAND));
    await userEvent.selectOptions(within(part).getByRole("combobox", { name: b.stage }), "contacted");
    expect(requestMoveBusiness).toHaveBeenCalledWith(MEERA, "contacted");
    await waitFor(() => expect(within(part).getByRole("combobox", { name: b.stage })).toHaveValue("contacted"));
    expect(refresh).toHaveBeenCalled();
  });

  it("gives a lead to another owner", async () => {
    requestAssignBusiness.mockResolvedValue({ kind: "done", business: { ...ENTRY, ownerId: ASHA, ownerName: "Asha Rao" } });
    const part = section(record(BY_HAND));
    await userEvent.selectOptions(within(part).getByRole("combobox", { name: b.owner }), ASHA);
    expect(requestAssignBusiness).toHaveBeenCalledWith(MEERA, ASHA);
    await waitFor(() => expect(within(part).getByRole("combobox", { name: b.owner })).toHaveValue(ASHA));
  });

  it("draws a lead whose owner has left as owned by nobody, and still lets it be given to someone", () => {
    const part = section(record({ ...BY_HAND, business: { ...ENTRY, ownerId: KIRAN, ownerName: null } }));
    const owner = within(part).getByRole("combobox", { name: b.owner }) as HTMLSelectElement;
    expect(owner.selectedOptions[0]).toHaveTextContent(b.nobody);
    expect(Array.from(owner.options).map((o) => o.textContent)).toEqual([b.nobody, "Asha Rao", "Kiran Das"]);
  });

  it("says why a move was refused, and leaves the stage as it was", async () => {
    requestMoveBusiness.mockResolvedValue({ kind: "failed", message: b.errors.notIn });
    const part = section(record(BY_HAND));
    await userEvent.selectOptions(within(part).getByRole("combobox", { name: b.stage }), "won");
    await waitFor(() => expect(error).toHaveBeenCalledWith(b.errors.notIn));
    expect(within(part).getByRole("combobox", { name: b.stage })).toHaveValue("new");
  });

  it("removes a lead from the pipeline after asking, and keeps the lead", async () => {
    requestUnmarkBusiness.mockResolvedValue({ kind: "done" });
    const drawer = record(BY_HAND);
    await userEvent.click(within(section(drawer)).getByRole("button", { name: b.remove }));
    const asking = await screen.findByRole("alertdialog", { name: b.removeTitle });
    expect(within(asking).getByText(b.removeDetail)).toBeInTheDocument();
    expect(requestUnmarkBusiness).not.toHaveBeenCalled();
    await userEvent.click(within(asking).getByRole("button", { name: b.removeConfirm }));
    expect(requestUnmarkBusiness).toHaveBeenCalledWith(MEERA);
    await waitFor(() => expect(success).toHaveBeenCalledWith(b.removed));
    expect(within(section(drawer)).getByText(b.notIn)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    // Added by hand, so still kept though it has left the pipeline.
    expect(within(drawer).getByText(b.kept)).toBeInTheDocument();
  });

  it("offers to mark a lead that is not in the pipeline, with the lead named in place of an email", async () => {
    requestMarkBusiness.mockResolvedValue({ kind: "done", business: { ...ENTRY, name: null, organisation: null, about: "Asked about group bookings", ownerId: ASHA, ownerName: "Asha Rao" } });
    const drawer = record(SIGN_UP);
    expect(within(section(drawer)).getByText(b.notIn)).toBeInTheDocument();
    expect(within(drawer).getByText(m.record.retention)).toBeInTheDocument();
    await userEvent.click(within(section(drawer)).getByRole("button", { name: b.markAction }));
    const form = await screen.findByRole("dialog", { name: b.markTitle });
    expect(within(form).getByText("s•••@example.com")).toBeInTheDocument();
    expect(within(form).queryByLabelText(b.email)).not.toBeInTheDocument();
    expect(within(form).getByText(b.markLegend)).toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText(b.about), "Asked about group bookings");
    await userEvent.click(within(form).getByRole("button", { name: b.markAction }));
    expect(requestMarkBusiness).toHaveBeenCalledWith(SIGN_UP.id, { name: "", organisation: "", about: "Asked about group bookings", owner: ASHA });
    await waitFor(() => expect(success).toHaveBeenCalledWith(b.marked));
    expect(within(section(drawer)).getByRole("combobox", { name: b.stage })).toHaveValue("new");
    expect(within(section(drawer)).getByText("Asked about group bookings")).toBeInTheDocument();
  });
});
