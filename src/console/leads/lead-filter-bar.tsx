"use client";

import { EmailFilterBar } from "@/console/components/email-filter-bar";
import { Picker } from "@/console/components/picker";
import { ACCOUNT_STATUSES, LEAD_SOURCES, LEAD_TAG, NEWS_STATUSES, SEEN_RANGES, type LeadFilters } from "@/console/leads/filters";
import { findBody } from "@/console/leads/routes";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.leads;
const f = m.filters;

function among<T extends string>(values: readonly T[], value: string): T | null {
  return values.find((one) => one === value) ?? null;
}

/**
 * The search box, the five pickers and the chip row (ConsoleLeads.dc.html's filter bar, and the
 * phone board's: the box, its hint, then the pickers two across). The bar itself is the console's
 * shared one (email-filter-bar.tsx); the five pickers and what a pick does are this module's.
 */
export function LeadFilterBar({
  filters,
  tags,
  searching,
  searched,
  onPick,
  onFind,
  onClearSearch,
  onClearAll,
}: {
  readonly filters: LeadFilters;
  /** Every tag in use: the Tag filter's choices. */
  readonly tags: readonly string[];
  readonly searching: boolean;
  /** A search is applied: the chip row is drawn. */
  readonly searched: boolean;
  readonly onPick: (next: LeadFilters) => void;
  readonly onFind: (email: string) => void;
  readonly onClearSearch: () => void;
  readonly onClearAll: () => void;
}) {
  // A tag in the address that no lead carries any more is still the filter in force, so it is still
  // a choice: a picker that could not show its own value would read "All" over a filtered list.
  const tagChoices = filters.tag !== null && !tags.includes(filters.tag) ? [filters.tag, ...tags] : tags;

  const pickers = (stacked: boolean, forget: () => void) => {
    // Every pick goes back to page one with no record open, and drops a search: a narrower set has
    // fewer pages, and a search result is not a filtered list.
    const pick = (next: Partial<LeadFilters>) => {
      forget();
      onPick({ ...filters, ...next, page: 1, lead: null });
    };
    return (
      <>
        <Picker stacked={stacked} label={f.news} all={f.all} value={filters.news ?? ""} options={NEWS_STATUSES.map((one) => ({ value: one, label: m.news[one] }))} onPick={(value) => pick({ news: among(NEWS_STATUSES, value) })} />
        <Picker stacked={stacked} label={f.account} all={f.all} value={filters.account ?? ""} options={ACCOUNT_STATUSES.map((one) => ({ value: one, label: m.account[one] }))} onPick={(value) => pick({ account: among(ACCOUNT_STATUSES, value) })} />
        <Picker stacked={stacked} label={f.source} all={f.all} value={filters.source ?? ""} options={LEAD_SOURCES.map((one) => ({ value: one, label: m.sources[one] }))} onPick={(value) => pick({ source: among(LEAD_SOURCES, value) })} />
        <Picker stacked={stacked} label={f.tag} all={f.all} value={filters.tag ?? ""} options={tagChoices.map((one) => ({ value: one, label: one }))} onPick={(value) => pick({ tag: LEAD_TAG.test(value) ? value : null })} />
        {/* The sheet sets First seen against the row's right edge, apart from the four facts about a lead;
            on a phone it is the fifth of five in two columns, and takes the last row whole. */}
        {stacked ? null : <span className="grow" />}
        <div className={stacked ? "col-span-2" : "contents"}>
          <Picker stacked={stacked} label={f.seen} all={f.anyTime} value={filters.seen === "any" ? "" : filters.seen} options={SEEN_RANGES.map((one) => ({ value: one, label: m.seen[one] }))} onPick={(value) => pick({ seen: among(SEEN_RANGES, value) ?? "any" })} />
        </div>
      </>
    );
  };

  return (
    <EmailFilterBar
      id="ld"
      words={{ label: f.label, search: f.search, hint: f.hint, find: f.find, legend: f.legend, exact: f.exact, removeExact: f.removeExact, clear: f.clear, notAddress: m.errors.notAddress }}
      searching={searching}
      searched={searched}
      accept={(draft) => {
        const body = findBody.safeParse({ email: draft });
        return body.success ? body.data.email : null;
      }}
      pickers={pickers}
      onFind={onFind}
      onClearSearch={onClearSearch}
      onClearAll={onClearAll}
    />
  );
}
