"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { notify } from "@/components/ui/toast";
import { BUSINESS_STAGES, type BusinessMember } from "@/console/leads/business";
import { MarkBusinessLead } from "@/console/leads/business-lead-dialog";
import type { LeadBusiness } from "@/console/leads/leads";
import { requestAssignBusiness, requestMoveBusiness, requestUnmarkBusiness } from "@/console/leads/leads-client";
import { Facts, RecordSection } from "@/console/components/record-section";
import { consoleMessages } from "@/console/messages";

const b = consoleMessages.leads.business;
const blank = consoleMessages.leads.table.blank;

/**
 * The record's Business enquiry section (ConsoleLeads.dc.html, Record: business and Remove: confirm).
 *
 * A lead that is not in the pipeline says so, and can be marked. One that is shows its stage and
 * its owner as pickers, and what was typed about it; each pick is sent as it is made, and the
 * section redraws from what the database answered rather than from what was picked.
 *
 * REMOVING KEEPS THE LEAD. It is asked first, in a plain confirm: no key, since nothing here needs
 * one, but the name, the organisation and the line about the lead are typed words that go for good.
 *
 * ON A PHONE NOTHING HERE CAN BE CHANGED, as the phone board draws it: the pickers are words, and
 * the two buttons are not drawn (`display: none`, so neither is in the tab order).
 *
 * `business` is the entry as it stands now, or null. `onChange` is told what it became.
 */
export function BusinessSection({
  lead,
  business,
  members,
  me,
  onChange,
}: {
  readonly lead: { readonly id: string; readonly email: string };
  readonly business: LeadBusiness | null;
  readonly members: readonly BusinessMember[];
  readonly me: string;
  readonly onChange: (business: LeadBusiness | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (business === null) {
    return (
      <RecordSection title={b.section}>
        <p className="text-ink-3 text-label">{b.notIn}</p>
        <div className="mt-3 max-sm:hidden">
          <MarkBusinessLead lead={lead} members={members} me={me} onMarked={onChange} />
        </div>
      </RecordSection>
    );
  }

  async function send(request: Promise<{ readonly kind: "done"; readonly business: LeadBusiness } | { readonly kind: "failed"; readonly message: string }>): Promise<void> {
    setBusy(true);
    const outcome = await request;
    setBusy(false);
    if (outcome.kind === "failed") notify.error(outcome.message);
    else onChange(outcome.business);
  }

  async function remove(): Promise<void> {
    const outcome = await requestUnmarkBusiness(lead.id);
    setRemoving(false);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return;
    }
    notify.success(b.removed);
    onChange(null);
  }

  // An owner who has left the console is nobody's owner: the picker says so, and offers the rest.
  const owned = business.ownerName !== null && business.ownerId !== null && members.some((one) => one.id === business.ownerId);
  const owners = [...(owned ? [] : [{ value: "", label: b.nobody }]), ...members.map((one) => ({ value: one.id, label: one.name }))];
  const stage = business.stage;

  return (
    <RecordSection title={b.section} tight>
      <Facts
        items={[
          [
            b.stage,
            <span key="stage">
              <NativeSelect aria-label={b.stage} className="w-[220px] max-w-full max-sm:hidden" disabled={busy} value={stage} onChange={(event) => { const next = BUSINESS_STAGES.find((one) => one === event.target.value); if (next && next !== stage) void send(requestMoveBusiness(lead.id, next)); }} options={BUSINESS_STAGES.map((one) => ({ value: one, label: b.stages[one] }))} />
              <span className="sm:hidden">{b.stages[stage]}</span>
            </span>,
          ],
          [
            b.owner,
            <span key="owner">
              <NativeSelect aria-label={b.owner} className="w-[220px] max-w-full max-sm:hidden" disabled={busy} value={owned ? (business.ownerId ?? "") : ""} onChange={(event) => { if (event.target.value !== "") void send(requestAssignBusiness(lead.id, event.target.value)); }} options={owners} />
              <span className="sm:hidden">{owned ? business.ownerName : b.nobody}</span>
            </span>,
          ],
          [b.nameLabel, business.name ?? blank],
          [b.organisationLabel, business.organisation ?? blank],
          [b.about, business.about],
        ]}
      />
      <div className="mt-3 max-sm:hidden">
        <Button variant="ghost" onClick={() => setRemoving(true)}>
          {b.remove}
        </Button>
      </div>
      <ConfirmDialog
        open={removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(false);
        }}
        title={b.removeTitle}
        before={<p className="text-lg font-medium [overflow-wrap:anywhere]">{lead.email}</p>}
        description={b.removeDetail}
        confirmLabel={b.removeConfirm}
        tone="primary"
        onConfirm={remove}
      />
    </RecordSection>
  );
}
