"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { NativeSelect, type NativeSelectOption } from "@/components/ui/native-select";
import {
  AUDIT_CATEGORIES,
  AUDIT_SEARCH_MAX,
  AUDIT_RANGES,
  AUDIT_RESULTS,
  auditRangeAsDays,
  clearAuditFilters,
  hasActiveAuditFilters,
  type AuditFilters,
  type AuditMemberOption,
  type AuditRange,
} from "@/console/audit/filters";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";

const m = consoleMessages.audit;

/**
 * Tailwind's own `sm`, as a query this file can listen to.
 *
 * The literal is duplicated from CSS deliberately and it is the third copy in this codebase
 * (`src/styles/base.css:69`, `src/styles/utilities.css:236`), because there is nothing to import:
 * Tailwind v4 keeps its breakpoints in the stylesheet, not in a config module. Everything else on
 * this page picks its layout in CSS and never reads a width at all; this is the one thing CSS
 * cannot do, and it is behaviour rather than layout (see the effect that uses it).
 */
const SM_UP = "(min-width: 40rem)";

/** A category's label, or the value itself for one this console has never written. */
export function auditCategoryLabel(category: string): string {
  return category in m.categories ? m.categories[category as keyof typeof m.categories] : category;
}

// AuditLog.dc.html draws the ranges as toggle buttons inside a role="group" (:120-125) -- deliberately
// not tabs, which would promise a tabpanel underneath. The classes are the segmented control's own
// (src/components/ui/tabs.tsx), reproduced rather than imported because that component is Base UI's
// tablist and cannot carry aria-pressed.
//
// `max-sm:h-11 max-sm:flex-1` is AuditLogPhone.dc.html:79's `tabs tabs-lg`, which industry.css
// defines as exactly that (`.tabs-lg .tab { height: 44px; flex: 1 }`): on a phone every tab is a
// 44px target and the four of them share the row. Both sheets draw the same four buttons carrying
// aria-pressed, so this is one control at two heights rather than two controls.
const TAB =
  "press inline-flex h-8 items-center justify-center px-3 font-display text-2xs font-semibold uppercase tracking-caps outline-none not-first:border-l not-first:border-line hover:bg-accent/12 max-sm:h-11 max-sm:flex-1";

function RangeTab({ range, current, onPick }: { readonly range: AuditRange; readonly current: AuditRange; readonly onPick: (range: AuditRange) => void }) {
  const on = range === current;
  return (
    <button type="button" aria-pressed={on} onClick={() => onPick(range)} className={cn(TAB, on ? "bg-accent/16 text-accent-text" : "text-ink-3")}>
      {m.filters.ranges[range]}
    </button>
  );
}

/**
 * A picker, with the sheet's own label beside it. `""` is All -- never sent to the database as an
 * empty string (see filters.ts).
 *
 * `stacked` is the same control inside the phone's filter dialog, where a 390px row has no space
 * for a label beside a select: the label goes above it and the select takes the width, at the 44px
 * the phone sheet gives every control. Same label, same options, same `onPick` -- so both widths
 * write the same filter model and the same URL.
 */
function Picker({
  label,
  value,
  options,
  onPick,
  stacked = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly NativeSelectOption[];
  readonly onPick: (value: string) => void;
  readonly stacked?: boolean;
}) {
  return (
    <label className={cn("flex gap-2", stacked ? "flex-col" : "items-center")}>
      <span className="legend whitespace-nowrap text-ink-3">{label}</span>
      <NativeSelect
        size={stacked ? "lg" : "md"}
        className={stacked ? undefined : "w-auto min-w-[10ch]"}
        value={value}
        onChange={(event) => onPick(event.target.value)}
        options={[{ value: "", label: m.filters.all }, ...options]}
      />
    </label>
  );
}

/**
 * The search box (AuditLog.dc.html:114), wherever it is drawn -- the wide bar, or the phone's own
 * filter dialog.
 *
 * It applies on submit and on blur, not on every keystroke. The sheet draws a plain box and says
 * nothing either way; a request per character against two years of history is not a search box, it
 * is a load test, and `console_audit` has no index that covers `reason` or `target`
 * (task-1-report.md).
 */
function SearchBox({ applied, onApply, large = false }: { readonly applied: string; readonly onApply: (search: string) => void; readonly large?: boolean }) {
  // The box holds an unapplied draft, so it is state rather than a prop -- but a search cleared from
  // the chip row, or by Clear filters, has to move the box too. Adjusted during render against the
  // last applied value rather than in an effect: an effect would paint the stale draft first and
  // then re-render, which is the cascading render react-hooks/set-state-in-effect exists to stop
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [draft, setDraft] = useState(applied);
  const [seen, setSeen] = useState(applied);
  if (seen !== applied) {
    setSeen(applied);
    setDraft(applied);
  }

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (draft.trim() !== applied) onApply(draft.trim());
  };

  return (
    <form onSubmit={submit} className={cn("relative max-w-full", large ? "w-full" : "w-[300px]")}>
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
        className={cn("well w-full pl-8 pr-2.5 placeholder:text-ink-3", large ? "h-11" : "h-10")}
        aria-label={m.filters.search}
        placeholder={m.filters.search}
        // Stops where parseAuditFilters stops, the same way the Reason field stops where
        // tapReason stops. Not a nicety: the search is part of the export's canonical filter
        // object, so an unbounded one overflows the export route's own FILTERS_MAX and the
        // export fails *after* the member has typed a reason and tapped their key. A ceremony
        // must never be spent on a request that could not have succeeded.
        maxLength={AUDIT_SEARCH_MAX}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => submit()}
      />
    </form>
  );
}

/**
 * An applied filter, and the control that takes it off.
 *
 * **One button, two geometries.** AuditLog.dc.html:131 draws a grey tag with a 16px `tag-x` inside
 * it; AuditLogPhone.dc.html:92 draws the tag *itself* as the button, at `min-height: 44px`, with
 * the remove label on the tag rather than on an x. The accessible name is byte-identical in both
 * ("Remove the filter Category: Messages"), and that is what forces the merge: two chip rows, one
 * per breakpoint, would put two controls with that one name in the tree at the same time, and a
 * screen reader has no way to tell a member which of them is the real one.
 *
 * So the whole tag is the control at every width. Below sm it is the drawn 44px target; above it,
 * the drawn compact tag with its x -- with a pointer target that is the tag rather than the 16px
 * square at its right, which is the one respect in which the wide layout is not 1:1 and is strictly
 * easier to hit.
 */
function Chip({ label, onRemove }: { readonly label: string; readonly onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label={m.filters.remove(label)}
      onClick={onRemove}
      className="press inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-0 bg-surface-1 py-[3px] pl-2.5 pr-1 text-2xs leading-normal tracking-head text-ink-2 hover:text-ink-1 max-sm:min-h-11 max-sm:gap-2 max-sm:px-3 max-sm:text-label"
    >
      {label}
      <span className="inline-flex size-5 items-center justify-center text-ink-3" aria-hidden="true">
        {/* 10px as AuditLog.dc.html:131 draws it, 12px as AuditLogPhone.dc.html:92 does. */}
        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="size-2.5 max-sm:size-3">
          <path d="M2 2l6 6M8 2 2 8" />
        </svg>
      </span>
    </button>
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
  /**
   * The Member picker's roster: every actor in the log, from `public.console_audit_actors`, and
   * **not** the actors the rows on screen happen to name (Task 6). It is passed once and read by
   * both copies of the picker below -- the wide bar and the phone's filter dialog -- because both
   * are one `pickers()` call, so a roster that reached only one of them is not expressible here.
   */
  readonly members: readonly AuditMemberOption[];
  readonly onChange: (next: AuditFilters) => void;
}) {
  // AuditLogPhone.dc.html:85's dialog, open or closed. Its contents are mounted only while it is
  // open (Base UI portals nothing otherwise), which is also what keeps the search box and the four
  // pickers from existing twice in the accessibility tree at once.
  const [sheetOpen, setSheetOpen] = useState(false);

  /**
   * A rotate, or a window dragged wider, while the dialog is open.
   *
   * The only width this file reads, and it reads it for behaviour rather than layout: closing a
   * modal is not something a stylesheet can do. Left open past sm, the dialog is a phone sheet
   * sitting on a desktop-width page -- over a bar that is by then drawing the very same search box
   * and the very same four pickers behind it. Two live copies of one control, with focus trapped in
   * the copy the member cannot see the page around.
   *
   * A listener and nothing else: the trigger is `sm:hidden`, so the dialog can never be *opened*
   * while wide, and there is no state to reconcile on mount. `addEventListener` is guarded because
   * a `matchMedia` stub need not implement it (tests/setup.ts ships one that does not).
   */
  useEffect(() => {
    if (!sheetOpen || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const wide = window.matchMedia(SM_UP);
    if (typeof wide.addEventListener !== "function") return;
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setSheetOpen(false);
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [sheetOpen]);

  // Every change goes back to page one: a narrower set has fewer pages, and page 7 of 2 is an
  // empty table with no explanation.
  const apply = (next: Partial<AuditFilters>) => onChange({ ...filters, ...next, page: 1 });

  /**
   * Picking `Custom` seeds the two day boxes with the range already on screen, rather than emptying
   * them: a custom range with neither day chosen is not a range at all -- it would have asked
   * `console_audit` for an unbounded scan and a `count(*)` over two years of history, under a
   * caption reading "for the chosen dates". Seeded, `Custom` refines what the member is looking at,
   * which is what the word means beside Today / 7 days / 30 days. Every other range clears them,
   * so a stale pair cannot ride along in the address behind a fixed range.
   */
  const pickRange = (next: AuditRange) => {
    if (next !== "custom") return apply({ range: next, from: null, to: null });
    const seeded = filters.range === "custom" ? { from: filters.from, to: filters.to } : auditRangeAsDays(filters.range, new Date());
    apply({ range: next, ...seeded });
  };

  const active = hasActiveAuditFilters(filters, environment);
  const memberName = members.find((one) => one.id === filters.member)?.name ?? filters.member ?? "";

  const chips: readonly { readonly label: string; readonly clear: Partial<AuditFilters> }[] = [
    ...(filters.search ? [{ label: m.filters.chip(m.filters.search, filters.search), clear: { search: "" } }] : []),
    ...(filters.member ? [{ label: m.filters.chip(m.filters.member, memberName), clear: { member: null } }] : []),
    ...(filters.category ? [{ label: m.filters.chip(m.filters.category, auditCategoryLabel(filters.category)), clear: { category: null } }] : []),
    ...(filters.result ? [{ label: m.filters.chip(m.filters.result, m.results[filters.result]), clear: { result: null } }] : []),
    // **Departure from the sheet, deliberate and approved** (branch review; signed off by the
    // plan's owner). AuditLog.dc.html:130 draws the chip row only when a filter is active, behind
    // its own `hasActiveFilter`, which is false on an unfiltered page. This chip is drawn at its
    // default, so the row is now on screen every time the module opens.
    //
    // The reason is the Critical this branch just closed. The Environment filter always has a value
    // -- a board opens scoped to its own deployment -- so with no chip a member cannot tell a log
    // with no exports in it from a log whose exports were filed against a different deployment.
    // That is not hypothetical: it is the exact state an Admin could put an Owner in by forging
    // `p_environment`, and chipping the default is what makes the scope visible instead of
    // inferred. An empty result that is silently "empty *in production*" is worse than a chip the
    // sheet did not draw.
    //
    // Chipped whenever the view is scoped to one deployment, and not when it is already every one:
    // "Environment: All" is not a filter, and a chip whose removal does nothing is worse than none.
    // Removing it widens to All, exactly as removing any other chip removes a filter rather than
    // swapping it for a different one.
    ...(filters.environment !== null
      ? [{ label: m.filters.chip(m.filters.environment, filters.environment), clear: { environment: null } }]
      : []),
  ];

  // The environments a member can ask for: this deployment's own, and the three a Vercel/Node
  // deployment can be. Not a closed set in the database, so the list is a convenience -- and the
  // filter itself is a convenience, never isolation (task-2-addendum.md §4).
  const environments = [...new Set([environment, "production", "preview", "development"])];

  // The four pickers, drawn once and rendered in whichever of the two places is on screen: the wide
  // bar beside the search box, or the phone's dialog behind `Search and filters`. One definition,
  // so a filter cannot exist at one width and not the other.
  const pickers = (stacked: boolean) => (
    <>
      <Picker
        stacked={stacked}
        label={m.filters.member}
        value={filters.member ?? ""}
        options={members.map((one) => ({ value: one.id, label: one.name }))}
        onPick={(value) => apply({ member: value || null })}
      />
      <Picker
        stacked={stacked}
        label={m.filters.category}
        value={filters.category ?? ""}
        options={AUDIT_CATEGORIES.map((category) => ({ value: category, label: auditCategoryLabel(category) }))}
        onPick={(value) => apply({ category: value || null })}
      />
      <Picker
        stacked={stacked}
        label={m.filters.result}
        value={filters.result ?? ""}
        options={AUDIT_RESULTS.map((result) => ({ value: result, label: m.results[result] }))}
        onPick={(value) => apply({ result: AUDIT_RESULTS.find((one) => one === value) ?? null })}
      />
      <Picker
        stacked={stacked}
        label={m.filters.environment}
        value={filters.environment ?? ""}
        options={environments.map((one) => ({ value: one, label: one }))}
        onPick={(value) => apply({ environment: value || null })}
      />
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <div role="search" aria-label={m.filters.regionLabel} className="flex flex-wrap items-center gap-2.5 max-sm:gap-2">
        {/*
          AuditLog.dc.html:111-119's own row. `max-sm:hidden` because AuditLogPhone.dc.html:78 draws
          this row with two things in it and neither is a picker -- the date tabs, and one icon
          button. The controls are not dropped on a phone, they move (see the dialog below): a phone
          that cannot filter the audit log is a phone that cannot answer a question about it.
        */}
        <div className="flex grow flex-wrap items-center gap-2.5 max-sm:hidden">
          <SearchBox applied={filters.search} onApply={(search) => apply({ search })} />
          {pickers(false)}
        </div>

        {/* :79 -- the tabs take the phone row's width; on a wide board they sit at its right end. */}
        <div className="inline-flex border border-line max-sm:grow" role="group" aria-label={m.filters.rangeLabel}>
          {AUDIT_RANGES.map((range) => (
            <RangeTab key={range} range={range} current={filters.range} onPick={pickRange} />
          ))}
        </div>

        {/*
          :85 -- the phone's one filter control, `aria-haspopup="dialog"` and a 44px box. The sheet
          draws the trigger and not what is behind it, so the dialog's own title is this same name
          and its contents are the desktop bar's, unchanged.
        */}
        <IconButton
          variant="secondary"
          size="lg"
          className="sm:hidden"
          label={m.filters.phoneTrigger}
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M3 5h14M5.5 10h9M8 15h4" />
            </svg>
          }
        />

        {/* Not drawn on either sheet: both offer `Custom` and draw no fields behind it. Two day
            boxes are the smallest honest thing that word can mean, and they only exist while it is
            chosen. On a phone they take a row of their own at the drawn 44px, because there is no
            room for two dates beside four tabs. */}
        {filters.range === "custom" ? (
          <div className="flex flex-wrap items-center gap-2.5 max-sm:w-full max-sm:gap-2">
            <label className="flex items-center gap-2 max-sm:grow">
              <span className="legend whitespace-nowrap text-ink-3">{m.filters.customFrom}</span>
              <input type="date" className="well h-10 px-2.5 max-sm:h-11 max-sm:grow" value={filters.from ?? ""} onChange={(event) => apply({ from: event.target.value || null })} />
            </label>
            <label className="flex items-center gap-2 max-sm:grow">
              <span className="legend whitespace-nowrap text-ink-3">{m.filters.customTo}</span>
              <input type="date" className="well h-10 px-2.5 max-sm:h-11 max-sm:grow" value={filters.to ?? ""} onChange={(event) => apply({ to: event.target.value || null })} />
            </label>
          </div>
        ) : null}
      </div>

      {/*
        The dialog AuditLogPhone.dc.html:85 promises and does not draw. **Not drawn**, so nothing in
        it is invented copy: its title is the trigger's own accessible name and every control inside
        it is the desktop bar's, with the same label and the same handler.

        Mounted only while open (Base UI portals nothing otherwise), which is what keeps one search
        box and one of each picker in the accessibility tree at a time although both layouts are in
        the tree. There is no Apply: each control reports its change immediately, exactly as it does
        on a wide board, so the URL and the rows follow the filter rather than a submit.
      */}
      <DialogRoot open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent size="sm" title={m.filters.phoneTrigger}>
          <div className="flex flex-col gap-4">
            <SearchBox large applied={filters.search} onApply={(search) => apply({ search })} />
            {pickers(true)}
          </div>
        </DialogContent>
      </DialogRoot>

      {/*
        `chips.length > 0` where the sheet has `hasActiveFilter` (:130) -- the second half of the
        approved departure recorded beside the Environment chip above. Since that chip is drawn at
        its default, this row is the ordinary case rather than the filtered one.

        Clear filters keeps the sheet's own condition, and that is not an inconsistency:
        `clearAuditFilters` returns to the default view, so beside only the environment chip it
        would be a button that visibly does nothing.
      */}
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2.5 max-sm:gap-x-2.5 max-sm:gap-y-2">
          {/*
            `max-sm:hidden`: AuditLog.dc.html:130 draws the word "Filters" in front of the chips and
            AuditLogPhone.dc.html:91-94 draws the chips alone. On a phone the chip already says what
            it filters by ("Category: Messages"), and a legend in front of it spends a line of a
            390px screen repeating that these are filters.
          */}
          <span className="legend text-ink-3 max-sm:hidden">{m.filters.active}</span>
          {chips.map((chip) => (
            <Chip key={chip.label} label={chip.label} onRemove={() => apply(chip.clear)} />
          ))}
          {/* :93's `btn-lg`. */}
          {active ? (
            <Button variant="ghost" className="max-sm:h-11" onClick={() => onChange(clearAuditFilters(filters, environment))}>
              {m.filters.clear}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
