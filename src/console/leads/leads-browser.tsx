"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "@/components/ui/toast";
import { hasFilters, leadQuery, LEAD_PAGE_SIZE, NO_LEAD_FILTERS, type LeadFilters } from "@/console/leads/filters";
import { LeadDrawer } from "@/console/leads/lead-drawer";
import { LeadFilterBar } from "@/console/leads/lead-filter-bar";
import type { LeadDetail, LeadNote, LeadPage, LeadRow } from "@/console/leads/leads";
import { requestFind, requestNote, requestReveal, requestTag } from "@/console/leads/leads-client";
import { LeadsPlate, type LeadsState, type ShownLead } from "@/console/leads/leads-plate";
import { consoleMessages } from "@/console/messages";
import { formatCount } from "@/utils/datetime";

const t = consoleMessages.leads.table;

/**
 * The filter bar, the Leads plate and the record over them (ConsoleLeads.dc.html), and the one
 * client component on the page.
 *
 * WHAT IS IN THE ADDRESS AND WHAT IS NOT. The four filters, the page and the open lead's id are in
 * the address, so the server reads the list and the record and a view can be linked. A searched
 * email and a revealed one are held here, in this component's state, and nowhere else: a reload
 * masks every address again and forgets the search, and a second look is a second audit row.
 *
 * EVERY ADDRESS IS MASKED UNTIL REVEALED. What is revealed is shared by the row and the record, so
 * revealing in one shows in the other.
 *
 * `page` is `null` when the list could not be read. It is never drawn as "no leads".
 */
export function LeadsBrowser({
  page,
  filters,
  detail,
  tags,
}: {
  readonly page: LeadPage | null;
  readonly filters: LeadFilters;
  /** Every tag in use: the Tag filter's choices, and what the record offers as one is typed. */
  readonly tags: readonly string[];
  /** The open lead's record; why there is none to draw; or null when no record is open. */
  readonly detail: LeadDetail | "unavailable" | "gone" | null;
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<Readonly<Record<string, string>>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  // A search that has been answered: the one lead with that address, or null for nobody.
  const [search, setSearch] = useState<{ readonly lead: LeadRow | null } | null>(null);
  const [searching, setSearching] = useState(false);
  // What a write answered, by lead: its tags and notes as the database now holds them. The record
  // shows these at once; the list behind it and the Tag filter are re-read from the server.
  const [written, setWritten] = useState<Readonly<Record<string, { readonly tags?: readonly string[]; readonly notes?: readonly LeadNote[] }>>>({});

  async function reveal(id: string): Promise<void> {
    setRevealing(id);
    const outcome = await requestReveal(id);
    setRevealing(null);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return;
    }
    setRevealed((before) => ({ ...before, [id]: outcome.address }));
  }

  async function find(email: string): Promise<void> {
    setSearching(true);
    const outcome = await requestFind(email);
    setSearching(false);
    if (outcome.kind === "failed") {
      // The list stays as it was: a lookup that failed found out nothing.
      notify.error(outcome.message);
      return;
    }
    setSearch({ lead: outcome.lead });
  }

  async function tag(id: string, name: string, remove: boolean): Promise<boolean> {
    const outcome = remove ? await requestTag(id, name, true) : await requestTag(id, name);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return false;
    }
    setWritten((before) => ({ ...before, [id]: { ...before[id], tags: outcome.tags } }));
    router.refresh();
    return true;
  }

  async function note(id: string, body: string): Promise<boolean> {
    const outcome = await requestNote(id, body);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return false;
    }
    setWritten((before) => ({ ...before, [id]: { ...before[id], notes: outcome.notes } }));
    router.refresh();
    return true;
  }

  const listed: readonly LeadRow[] = search ? (search.lead ? [search.lead] : []) : (page?.rows ?? []);
  const rows: readonly ShownLead[] = listed.map((row) => ({ ...row, shown: revealed[row.id] ?? row.email, hidden: revealed[row.id] === undefined }));

  const state: LeadsState = search ? (search.lead ? "rows" : "noMatch") : page === null ? "error" : page.rows.length > 0 ? "rows" : hasFilters(filters) ? "filtered" : "empty";

  const total = page?.total ?? 0;
  const first = (filters.page - 1) * LEAD_PAGE_SIZE + 1;
  const last = Math.min(filters.page * LEAD_PAGE_SIZE, total);
  const range = search ? t.range("1", "1", "1") : t.range(formatCount(first), formatCount(last), formatCount(total));
  const cell = search ? (search.lead ? t.oneMatch : t.noMatch) : state === "rows" ? range : t.blank;

  const open = filters.lead;
  const paged = (to: number) => leadQuery({ ...filters, page: to, lead: null });

  return (
    <>
      <LeadFilterBar
        filters={filters}
        tags={tags}
        searching={searching}
        searched={search !== null}
        onFind={(email) => void find(email)}
        onPick={(next) => {
          setSearch(null);
          router.push(leadQuery(next));
        }}
        onClearSearch={() => setSearch(null)}
        onClearAll={() => {
          setSearch(null);
          if (hasFilters(filters)) router.push(leadQuery(NO_LEAD_FILTERS));
        }}
      />
      <LeadsPlate
        state={state}
        rows={rows}
        cell={cell}
        pager={{ range, previous: !search && filters.page > 1 ? paged(filters.page - 1) : null, next: !search && last < total ? paged(filters.page + 1) : null }}
        openId={filters.lead}
        revealing={revealing}
        hrefFor={(row) => leadQuery({ ...filters, lead: row.id })}
        clearHref={leadQuery(NO_LEAD_FILTERS)}
        onReveal={(row) => void reveal(row.id)}
        onRetry={() => router.refresh()}
      />
      {detail !== null && open !== null ? (
        <LeadDrawer
          detail={detail}
          revealed={revealed[open] ?? null}
          revealing={revealing === filters.lead}
          tags={written[open]?.tags ?? (typeof detail === "string" ? [] : detail.tags)}
          notes={written[open]?.notes ?? (typeof detail === "string" ? [] : detail.notes)}
          suggestions={tags}
          onReveal={() => void reveal(open)}
          onTag={(name) => tag(open, name, false)}
          onUntag={(name) => tag(open, name, true)}
          onNote={(body) => note(open, body)}
          onClose={() => router.push(leadQuery({ ...filters, lead: null }))}
        />
      ) : null}
    </>
  );
}
