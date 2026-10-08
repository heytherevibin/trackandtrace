"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { LEAD_DELETE_ACTION, leadDeleteValue } from "@/console/leads/export";
import type { LeadDetail } from "@/console/leads/leads";
import { requestDelete } from "@/console/leads/leads-client";
import { RecordSection } from "@/console/components/record-section";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.leads.remove;

/**
 * The record's last section (ConsoleLeads.dc.html, Record: no account and Delete: confirm).
 *
 * ONLY A LEAD WITH NO ACCOUNT CAN BE DELETED HERE, and one that has an account says so instead of
 * offering the button. The greyed-out case is the drawing of the rule, not the rule: the database
 * refuses a lead with an account before it spends the member's key.
 *
 * The act is behind a reason and a key (TC-01). The tap is minted over this lead's id and this
 * deployment, and `requestDelete` sends the same strings on: nothing between the two may reshape
 * them, or the database's re-digest would not match.
 *
 * Not drawn on a phone: there, the record is read and nothing is changed.
 */
export function DeleteSection({
  lead,
  environment,
  tags,
  notes,
  onDeleted,
}: {
  readonly lead: LeadDetail;
  readonly environment: string;
  /** How many tags and notes the lead has now, for the confirm's own sentence. */
  readonly tags: number;
  readonly notes: number;
  readonly onDeleted: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const value = leadDeleteValue(environment);

  async function confirmed(): Promise<void> {
    const typed = reason;
    setAsking(false);
    const outcome = await requestDelete(lead.id, value, typed);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return;
    }
    notify.success(m.done);
    onDeleted();
  }

  return (
    <div className="max-sm:hidden">
      <RecordSection title={m.title}>
        {lead.account ? (
          <p className="text-ink-2 text-label">{m.hasAccount}</p>
        ) : (
          <>
            <p className="text-ink-2 text-label mb-3">{m.detail}</p>
            <Button
              onClick={() => {
                setReason("");
                setAsking(true);
              }}
            >
              {m.action}
            </Button>
          </>
        )}
      </RecordSection>
      <ConfirmItsYou
        open={asking}
        action={LEAD_DELETE_ACTION}
        target={lead.id}
        value={value}
        reason={reason}
        summary={m.summary(lead.email)}
        hint={m.hint(lead.consents.length, tags, notes)}
        onReasonChange={setReason}
        onCancel={() => setAsking(false)}
        onConfirmed={() => void confirmed()}
      />
    </div>
  );
}
