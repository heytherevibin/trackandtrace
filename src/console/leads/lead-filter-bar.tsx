"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Picker } from "@/console/components/picker";
import { ACCOUNT_STATUSES, LEAD_SOURCES, NEWS_STATUSES, SEEN_RANGES, type LeadFilters } from "@/console/leads/filters";
import { findBody } from "@/console/leads/routes";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";

const m = consoleMessages.leads;
const f = m.filters;

function among<T extends string>(values: readonly T[], value: string): T | null {
  return values.find((one) => one === value) ?? null;
}

/**
 * The search box, the four pickers and the chip row (ConsoleLeads.dc.html's filter bar, and the
 * phone board's: the box, its hint, then the pickers two across).
 *
 * THE SEARCH TAKES A WHOLE ADDRESS and applies on Enter. Part of one is refused here, in the form's
 * own words, before any request: every lookup is written to the audit log, and a typo should not be.
 * The address never goes to the page's address; `onFind` sends it in a request body.
 *
 * The pickers are drawn twice, a row from `sm` up and a 2×2 grid below it, each `display: none` at
 * the other width. Both write the same filter model.
 */
export function LeadFilterBar({
  filters,
  searching,
  searched,
  onPick,
  onFind,
  onClearSearch,
  onClearAll,
}: {
  readonly filters: LeadFilters;
  readonly searching: boolean;
  /** A search is applied: the chip row is drawn. */
  readonly searched: boolean;
  readonly onPick: (next: LeadFilters) => void;
  readonly onFind: (email: string) => void;
  readonly onClearSearch: () => void;
  readonly onClearAll: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [refused, setRefused] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim() === "") return;
    const body = findBody.safeParse({ email: draft });
    setRefused(!body.success);
    if (body.success) onFind(body.data.email);
  };

  // Every pick goes back to page one with no record open, and drops a search: a narrower set has
  // fewer pages, and a search result is not a filtered list.
  const pick = (next: Partial<LeadFilters>) => {
    setDraft("");
    setRefused(false);
    onPick({ ...filters, ...next, page: 1, lead: null });
  };

  const pickers = (stacked: boolean) => (
    <>
      <Picker stacked={stacked} label={f.news} all={f.all} value={filters.news ?? ""} options={NEWS_STATUSES.map((one) => ({ value: one, label: m.news[one] }))} onPick={(value) => pick({ news: among(NEWS_STATUSES, value) })} />
      <Picker stacked={stacked} label={f.account} all={f.all} value={filters.account ?? ""} options={ACCOUNT_STATUSES.map((one) => ({ value: one, label: m.account[one] }))} onPick={(value) => pick({ account: among(ACCOUNT_STATUSES, value) })} />
      <Picker stacked={stacked} label={f.source} all={f.all} value={filters.source ?? ""} options={LEAD_SOURCES.map((one) => ({ value: one, label: m.sources[one] }))} onPick={(value) => pick({ source: among(LEAD_SOURCES, value) })} />
      {/* The sheet sets First seen against the row's right edge, apart from the three facts about a lead. */}
      {stacked ? null : <span className="grow" />}
      <Picker stacked={stacked} label={f.seen} all={f.anyTime} value={filters.seen === "any" ? "" : filters.seen} options={SEEN_RANGES.map((one) => ({ value: one, label: m.seen[one] }))} onPick={(value) => pick({ seen: among(SEEN_RANGES, value) ?? "any" })} />
    </>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <div role="search" aria-label={f.label} className="flex flex-wrap items-center gap-2.5 max-sm:flex-col max-sm:items-stretch max-sm:gap-2">
        <form onSubmit={submit} className="relative w-[300px] max-w-full max-sm:w-full" noValidate>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="text-ink-3 pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            type="search"
            // Not `type="email"`: the browser's own bubble would answer part of an address before this form can.
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            className="well placeholder:text-ink-3 h-10 w-full pl-8 pr-2.5 max-sm:h-11"
            aria-label={f.search}
            aria-describedby={refused ? "ld-find-refused ld-find-hint" : "ld-find-hint"}
            aria-invalid={refused || undefined}
            aria-busy={searching || undefined}
            placeholder={f.search}
            maxLength={254}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setRefused(false);
            }}
          />
          <button type="submit" className="sr-only" tabIndex={-1}>
            {f.find}
          </button>
        </form>
        {/* One group: where the row has no room for all four beside the box they go under it
            together, First seen still against the right edge, and never one of them alone. `grow`
            and not `flex-1`: a basis of zero would always fit beside the box, and wrap inside. */}
        <div className="flex min-w-0 grow flex-wrap items-center gap-2.5 max-sm:hidden">{pickers(false)}</div>
        <div className={cn("flex basis-full flex-col gap-1", "max-sm:basis-auto")}>
          {refused ? (
            <p id="ld-find-refused" role="alert" className="text-label">
              {m.errors.notAddress}
            </p>
          ) : null}
          <p id="ld-find-hint" className="text-ink-3 text-label">
            {f.hint}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:hidden">{pickers(true)}</div>
      </div>

      {searched ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="legend text-ink-3 max-sm:hidden">{f.legend}</span>
          {/* The whole tag is the control, as the audit log's chips are: one button, one name. */}
          <button
            type="button"
            aria-label={f.removeExact}
            onClick={() => {
              setDraft("");
              onClearSearch();
            }}
            className="press bg-surface-1 text-2xs tracking-head text-ink-2 hover:text-ink-1 max-sm:text-label inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-0 py-[3px] pl-2.5 pr-1 leading-normal max-sm:min-h-11 max-sm:gap-2 max-sm:px-3"
          >
            {f.exact}
            <span className="text-ink-3 inline-flex size-5 items-center justify-center" aria-hidden="true">
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="size-2.5 max-sm:size-3">
                <path d="M2 2l6 6M8 2 2 8" />
              </svg>
            </span>
          </button>
          <Button
            variant="ghost"
            className="max-sm:h-11"
            onClick={() => {
              setDraft("");
              onClearAll();
            }}
          >
            {f.clear}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
