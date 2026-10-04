"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "@/components/ui/toast";
import type { BusinessMember } from "@/console/leads/business";
import { LeadDrawer } from "@/console/leads/lead-drawer";
import type { LeadBusiness, LeadDetail, LeadNote } from "@/console/leads/leads";
import { requestNote, requestReveal, requestTag } from "@/console/leads/leads-client";

/** A reveal the page behind the record shares with it, so revealing in one shows in the other. */
export interface SharedReveal {
  readonly revealed: string | null;
  readonly revealing: boolean;
  readonly onReveal: () => void;
}

/**
 * One lead's record and everything that can be done on it, for whichever page it opens over: the
 * Lifecycle list or the Business pipeline. The page reads the record (`detail`) and names the lead
 * in its address; this holds what has happened to it since.
 *
 * WHAT A WRITE ANSWERED IS SHOWN AT ONCE, and the page behind is re-read: a tag, a note or a move
 * changes the list or the board too. A revealed address is held here (or by the page, when it
 * shares one) and nowhere else: a reload masks it again.
 *
 * Kept by lead id, because the component stays mounted while a member opens one record after
 * another: what was revealed or written for one lead is never drawn on the next.
 */
export function LeadRecord({
  leadId,
  detail,
  suggestions,
  members,
  me,
  environment,
  closeHref,
  shared,
}: {
  readonly leadId: string;
  /** The record; or why there is none to draw. */
  readonly detail: LeadDetail | "unavailable" | "gone";
  /** Every tag in use, offered as one is typed. */
  readonly suggestions: readonly string[];
  /** Who may own a business lead, and the signed-in member's own id. */
  readonly members: readonly BusinessMember[];
  readonly me: string;
  /** The deployment, for the one act here that is approved under it: Delete lead. */
  readonly environment: string;
  /** Where closing the record, or deleting the lead, goes back to: the page without the lead in its address. */
  readonly closeHref: Route;
  readonly shared?: SharedReveal;
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<Readonly<Record<string, string>>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  // What a write answered, by lead: its tags, notes and pipeline entry as the database now holds
  // them. For the entry, `undefined` is "nothing written yet" and null is "taken out of the pipeline".
  const [written, setWritten] = useState<Readonly<Record<string, { readonly tags?: readonly string[]; readonly notes?: readonly LeadNote[]; readonly business?: LeadBusiness | null }>>>({});

  async function reveal(): Promise<void> {
    setRevealing(leadId);
    const outcome = await requestReveal(leadId);
    setRevealing(null);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return;
    }
    setRevealed((before) => ({ ...before, [leadId]: outcome.address }));
  }

  async function tag(name: string, remove: boolean): Promise<boolean> {
    const outcome = remove ? await requestTag(leadId, name, true) : await requestTag(leadId, name);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return false;
    }
    setWritten((before) => ({ ...before, [leadId]: { ...before[leadId], tags: outcome.tags } }));
    router.refresh();
    return true;
  }

  async function note(body: string): Promise<boolean> {
    const outcome = await requestNote(leadId, body);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return false;
    }
    setWritten((before) => ({ ...before, [leadId]: { ...before[leadId], notes: outcome.notes } }));
    router.refresh();
    return true;
  }

  const record = typeof detail === "string" ? null : detail;
  const mine = written[leadId];
  return (
    <LeadDrawer
      detail={detail}
      revealed={shared ? shared.revealed : (revealed[leadId] ?? null)}
      revealing={shared ? shared.revealing : revealing === leadId}
      tags={mine?.tags ?? record?.tags ?? []}
      notes={mine?.notes ?? record?.notes ?? []}
      suggestions={suggestions}
      business={mine?.business !== undefined ? mine.business : (record?.business ?? null)}
      members={members}
      me={me}
      environment={environment}
      onReveal={shared ? shared.onReveal : () => void reveal()}
      onTag={(name) => tag(name, false)}
      onUntag={(name) => tag(name, true)}
      onNote={note}
      onBusiness={(business) => {
        setWritten((before) => ({ ...before, [leadId]: { ...before[leadId], business } }));
        router.refresh();
      }}
      onDeleted={() => {
        // Back to the page the member came from, re-read: the lead is no longer on it.
        router.push(closeHref);
        router.refresh();
      }}
      onClose={() => router.push(closeHref)}
    />
  );
}
