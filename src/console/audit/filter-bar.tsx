"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect, type NativeSelectOption } from "@/components/ui/native-select";
import { AUDIT_CATEGORIES, AUDIT_RANGES, AUDIT_RESULTS, clearAuditFilters, hasActiveAuditFilters, type AuditFilters, type AuditRange } from "@/console/audit/filters";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";

const m = consoleMessages.audit;

/** An actor the Member picker can offer, as the loaded rows name them. */
export interface AuditMemberOption {
  readonly id: string;
  readonly name: string;
}

/** A category's label, or the value itself for one this console has never written. */
export function auditCategoryLabel(category: string): string {
  return category in m.categories ? m.categories[category as keyof typeof m.categories] : category;
}

// AuditLog.dc.html draws the ranges as toggle buttons inside a role="group" (:120-125) -- deliberately
// not tabs, which would promise a tabpanel underneath. The classes are the segmented control's own
// (src/components/ui/tabs.tsx), reproduced rather than imported because that component is Base UI's
// tablist and cannot carry aria-pressed.
const TAB = "press inline-flex h-8 items-center justify-center px-3 font-display text-2xs font-semibold uppercase tracking-caps outline-none not-first:border-l not-first:border-line hover:bg-accent/12";

function RangeTab({ range, current, onPick }: { readonly range: AuditRange; readonly current: AuditRange; readonly onPick: (range: AuditRange) => void }) {
  const on = range === current;
  return (
    <button type="button" aria-pressed={on} onClick={() => onPick(range)} className={cn(TAB, on ? "bg-accent/16 text-accent-text" : "text-ink-3")}>
      {m.filters.ranges[range]}
    </button>
  );
}

/** A picker, with the sheet's own label beside it. `""` is All -- never sent to the database as an empty string (see filters.ts). */
function Picker({
  label,
  value,
  options,
  onPick,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly NativeSelectOption[];
  readonly onPick: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="legend whitespace-nowrap text-ink-3">{label}</span>
      <NativeSelect
        className="w-auto min-w-[10ch]"
        value={value}
        onChange={(event) => onPick(event.target.value)}
        options={[{ value: "", label: m.filters.all }, ...options]}
      />
    </label>
  );
}

function Chip({ label, onRemove }: { readonly label: string; readonly onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap bg-surface-1 py-[3px] pl-2.5 pr-1 text-2xs leading-normal tracking-head text-ink-2">
      {label}
      <button type="button" aria-label={m.filters.remove(label)} onClick={onRemove} className="press inline-flex size-5 items-center justify-center text-ink-3 hover:text-ink-1">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M2 2l6 6M8 2 2 8" />
        </svg>
      </button>
    </span>
  );
}

/**
 * The search row, the pickers, the date range and the chips below them (AuditLog.dc.html:111-134).
 * Stateless but for the search box's own draft: every other control reports its change straight to
 * `onChange`, which is what puts it in the address and re-reads the page.
 *
 * The search box applies on submit and on blur, not on every keystroke. The sheet draws a plain
 * box and says nothing either way; a request per character against two years of history is not a
 * search box, it is a load test, and `console_audit` has no index that covers `reason` or `target`
 * (task-1-report.md).
 */
export function FilterBar({
  filters,
  environment,
  members,
  onChange,
}: {
  readonly filters: AuditFilters;
  readonly environment: string;
  readonly members: readonly AuditMemberOption[];
  readonly onChange: (next: AuditFilters) => void;
}) {
  // The box holds an unapplied draft, so it is state rather than a prop -- but a search cleared from
  // the chip row, or by Clear filters, has to move the box too. Adjusted during render against the
  // last applied value rather than in an effect: an effect would paint the stale draft first and
  // then re-render, which is the cascading render react-hooks/set-state-in-effect exists to stop
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [draft, setDraft] = useState(filters.search);
  const [applied, setApplied] = useState(filters.search);
  if (applied !== filters.search) {
    setApplied(filters.search);
    setDraft(filters.search);
  }

  // Every change goes back to page one: a narrower set has fewer pages, and page 7 of 2 is an
  // empty table with no explanation.
  const apply = (next: Partial<AuditFilters>) => onChange({ ...filters, ...next, page: 1 });

  const submitSearch = (event?: FormEvent) => {
    event?.preventDefault();
    if (draft.trim() !== filters.search) apply({ search: draft.trim() });
  };

  const active = hasActiveAuditFilters(filters, environment);
  const memberName = members.find((one) => one.id === filters.member)?.name ?? filters.member ?? "";

  const chips: readonly { readonly label: string; readonly clear: Partial<AuditFilters> }[] = [
    ...(filters.search ? [{ label: m.filters.chip(m.filters.search, filters.search), clear: { search: "" } }] : []),
    ...(filters.member ? [{ label: m.filters.chip(m.filters.member, memberName), clear: { member: null } }] : []),
    ...(filters.category ? [{ label: m.filters.chip(m.filters.category, auditCategoryLabel(filters.category)), clear: { category: null } }] : []),
    ...(filters.result ? [{ label: m.filters.chip(m.filters.result, m.results[filters.result]), clear: { result: null } }] : []),
    // The environment is a chip only once it stops being this deployment's own: it always has a
    // value, and chipping the default would put a chip on every unfiltered page.
    ...(filters.environment !== environment
      ? [{ label: m.filters.chip(m.filters.environment, filters.environment ?? m.filters.all), clear: { environment } }]
      : []),
  ];

  // The environments a member can ask for: this deployment's own, and the three a Vercel/Node
  // deployment can be. Not a closed set in the database, so the list is a convenience -- and the
  // filter itself is a convenience, never isolation (task-2-addendum.md §4).
  const environments = [...new Set([environment, "production", "preview", "development"])];

  return (
    <div className="flex flex-col gap-4">
      <div role="search" aria-label={m.filters.regionLabel} className="flex flex-wrap items-center gap-2.5">
        <form onSubmit={submitSearch} className="relative w-[300px] max-w-full">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            type="search"
            className="well h-10 w-full pl-8 pr-2.5 placeholder:text-ink-3"
            aria-label={m.filters.search}
            placeholder={m.filters.search}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => submitSearch()}
          />
        </form>

        <Picker
          label={m.filters.member}
          value={filters.member ?? ""}
          options={members.map((one) => ({ value: one.id, label: one.name }))}
          onPick={(value) => apply({ member: value || null })}
        />
        <Picker
          label={m.filters.category}
          value={filters.category ?? ""}
          options={AUDIT_CATEGORIES.map((category) => ({ value: category, label: auditCategoryLabel(category) }))}
          onPick={(value) => apply({ category: value || null })}
        />
        <Picker
          label={m.filters.result}
          value={filters.result ?? ""}
          options={AUDIT_RESULTS.map((result) => ({ value: result, label: m.results[result] }))}
          onPick={(value) => apply({ result: AUDIT_RESULTS.find((one) => one === value) ?? null })}
        />
        <Picker
          label={m.filters.environment}
          value={filters.environment ?? ""}
          options={environments.map((one) => ({ value: one, label: one }))}
          onPick={(value) => apply({ environment: value || null })}
        />

        <div className="grow" />

        <div className="inline-flex border border-line" role="group" aria-label={m.filters.rangeLabel}>
          {AUDIT_RANGES.map((range) => (
            <RangeTab key={range} range={range} current={filters.range} onPick={(next) => apply({ range: next, from: null, to: null })} />
          ))}
        </div>

        {/* Not drawn: the sheet offers `Custom` and draws no fields behind it. Two day boxes are the
            smallest honest thing that word can mean, and they only exist while it is chosen. */}
        {filters.range === "custom" ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-2">
              <span className="legend whitespace-nowrap text-ink-3">{m.filters.customFrom}</span>
              <input type="date" className="well h-10 px-2.5" value={filters.from ?? ""} onChange={(event) => apply({ from: event.target.value || null })} />
            </label>
            <label className="flex items-center gap-2">
              <span className="legend whitespace-nowrap text-ink-3">{m.filters.customTo}</span>
              <input type="date" className="well h-10 px-2.5" value={filters.to ?? ""} onChange={(event) => apply({ to: event.target.value || null })} />
            </label>
          </div>
        ) : null}
      </div>

      {active ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="legend text-ink-3">{m.filters.active}</span>
          {chips.map((chip) => (
            <Chip key={chip.label} label={chip.label} onRemove={() => apply(chip.clear)} />
          ))}
          <Button variant="ghost" onClick={() => onChange(clearAuditFilters(filters, environment))}>
            {m.filters.clear}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
