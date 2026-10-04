"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { notify } from "@/components/ui/toast";
import { hasFilters, leadQuery, LEAD_PAGE_SIZE, NO_LEAD_FILTERS, type LeadFilters } from "@/console/leads/filters";
import type { BusinessMember } from "@/console/leads/business";
import { LeadFilterBar } from "@/console/leads/lead-filter-bar";
import { LeadRecord } from "@/console/leads/lead-record";
import type { LeadDetail, LeadPage, LeadRow } from "@/console/leads/leads";
import { requestFind, requestReveal } from "@/console/leads/leads-client";
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
 * EVERY ADDRESS IS MASKED UNTIL REVEALED. What is revealed is shared by the row and the record
 * (lead-record.tsx), so revealing in one shows in the other.
 *
 * `page` is `null` when the list could not be read. It is never drawn as "no leads".
 */
export function LeadsBrowser({
  page,
  filters,
  detail,
  tags,
  environment,
  members,
  me,
  between,
}: {
  readonly page: LeadPage | null;
  readonly filters: LeadFilters;
  /** Every tag in use: the Tag filter's choices, and what the record offers as one is typed. */
  readonly tags: readonly string[];
  /** The deployment, for the one act here that is approved under it: Delete lead. */
  readonly environment: string;
  /** Who may own a business lead, and the signed-in member's own id. */
  readonly members: readonly BusinessMember[];
  readonly me: string;
  /** Drawn between the filters and the list: the export's status rows, which the page owns. */
  readonly between?: ReactNode;
  /** The open lead's record; why there is none to draw; or null when no record is open. */
  readonly detail: LeadDetail | "unavailable" | "gone" | null;
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<Readonly<Record<string, string>>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  // A search that has been answered: the one lead with that address, or null for nobody.
  const [search, setSearch] = useState<{ readonly lead: LeadRow | null } | null>(null);
  const [searching, setSearching] = useState(false);

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
      {between}
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
        <LeadRecord
          leadId={open}
          detail={detail}
          suggestions={tags}
          members={members}
          me={me}
          environment={environment}
          closeHref={leadQuery({ ...filters, lead: null })}
          shared={{ revealed: revealed[open] ?? null, revealing: revealing === open, onReveal: () => void reveal(open) }}
        />
      ) : null}
    </>
  );
}
