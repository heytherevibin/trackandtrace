"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuditEntry } from "@/console/audit/audit";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";
import { formatDateTime, formatTime } from "@/utils/datetime";

const m = consoleMessages.audit;
const f = consoleMessages.frame;
const ist = consoleMessages.frameSignedIn.clock.ist;

/**
 * One labelled cell of the card's two-column grid (AuditLogPhone.dc.html:107-110): the sheet's
 * `legend-sm` label with the value under it.
 *
 * `truncate` is the sheet's own `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`,
 * and it is drawn on **Target and Reason only**. Member carries a role tag beside it and Address is
 * a hash that must be readable in full, so both are left to wrap -- which is also why `min-w-0` is
 * on every cell rather than only the two that ellipsize: without it a long word in a grid column
 * pushes the column past its track and takes the card with it.
 */
function Cell({ label, truncate = false, children }: { readonly label: string; readonly truncate?: boolean; readonly children: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="legend-sm">{label}</span>
      {/* The sheet's 14px/20 (:108): `text-sm` is this codebase's 14px, with the drawn leading put
          back after it -- a font-size class resets line-height, so the 20 must come last. */}
      <span className={cn("text-sm leading-5 text-ink-1", truncate && "truncate")}>{children}</span>
    </span>
  );
}

/**
 * One entry, as the phone sheet draws it (AuditLogPhone.dc.html:103-112).
 *
 * **A button, where the sheet draws `<a href="#">` around the whole card.** The same ruling Task 3
 * made for the table's own Open control, for the same reason and with the same accessible name: the
 * entry has no address of its own -- there is no `/audit-log/<id>` route and this task does not add
 * one -- so a link here would be a link to nowhere, which a keyboard reaches and a screen reader
 * announces as somewhere to go. Nothing else about the card changes: `aria-label` is the sheet's
 * own `openLabel`, composed from the row's action and the row's time to the minute.
 *
 * The whole card is the one control, so nothing interactive may go inside it -- a nested button
 * would be unreachable markup and an invalid one. That is asserted rather than assumed
 * (entries-cards.test.tsx).
 */
function EntryCard({ row, onOpen }: { readonly row: AuditEntry; readonly onOpen: (row: AuditEntry) => void }) {
  return (
    <button
      type="button"
      aria-label={m.entries.open(row.action, `${formatTime(row.at)} ${ist}`)}
      onClick={() => onOpen(row)}
      className="press flex w-full cursor-pointer flex-col gap-1.5 border-t border-line px-4 py-3 text-left text-ink-1 first:border-t-0 hover:bg-accent-wash"
    >
      {/* :104 -- the time grows, the result chip sits against the right edge. */}
      <span className="flex items-center gap-2.5">
        <span className="legend-sm tnum shrink-0">{`${formatDateTime(row.at)} ${ist}`}</span>
        {/*
          Not drawn, and non-negotiable all the same (task-2-addendum.md §4): every row says which
          deployment wrote it, or a preview row reads as production's. The phone sheet omits it for
          exactly the reason the desktop sheet did -- both predate the ruling, and Task 2 added an
          undrawn Environment column to the table on the same grounds.

          Here rather than as a fifth grid cell: the desktop put it *second, beside the time*
          deliberately ("both say where a record came from rather than what it says"), and a fifth
          cell in a two-column grid would either break the sheet's drawn 2x2 pairing or land last,
          which is the placement Task 2 rejected. `min-w-0 truncate` so a long environment name can
          never push the result chip off the edge.
        */}
        <span className="legend-sm min-w-0 grow truncate">{row.environment}</span>
        <Badge variant={row.result === "done" ? "outline" : "neutral"}>{m.results[row.result]}</Badge>
      </span>

      {/* :105 -- 15px/22 at weight 500. `text-body` is this codebase's 15px. */}
      <span className="text-body font-medium leading-[22px]">{row.action}</span>

      {/* :106 -- two equal columns that may not grow past their track. */}
      <span className="mt-0.5 grid grid-cols-2 gap-x-3 gap-y-2">
        <Cell label={m.entries.columns.member}>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span>{row.actorName}</span>
            {/* The sheet's `hasRole` (:107): a System row has no role and gets no tag rather than an empty one. */}
            {row.actorRole ? <Badge variant="neutral">{f.roleLabel[row.actorRole]}</Badge> : null}
          </span>
        </Cell>
        <Cell label={m.entries.columns.target} truncate>
          {row.target ?? m.entries.none}
        </Cell>
        <Cell label={m.entries.columns.reason} truncate>
          {row.reason ? m.entries.quoted(row.reason) : m.entries.none}
        </Cell>
        {/*
          :110 draws `class="hash"`. The desktop sheet draws the same class on the same value
          (AuditLog.dc.html:171) and the shipped table renders it `tnum`, so the phone uses `tnum`
          too: one value, one treatment, and no drift between the two halves of this module.
        */}
        <Cell label={m.entries.columns.address}>
          <span className="tnum">{row.addressHash ?? m.entries.none}</span>
        </Cell>
      </span>
    </button>
  );
}

/**
 * The phone's entry list (AuditLogPhone.dc.html:101-113) -- a card per entry, not the table
 * narrowed.
 *
 * `DataTable`'s own stacked layout is the wrong shape for this page and that is why this file
 * exists: it prints one labelled pair per column, which here would be nine of them (Time,
 * Environment, Member, Action, Target, Reason, Result, Address, Open) in a flat list, where the
 * sheet draws a heading row, the action on its own line and four labelled cells in two columns.
 *
 * Stateless. The plate above owns which entry is open, exactly as it does for the table, so both
 * layouts open the same drawer through the same handler.
 */
export function EntriesCards({ rows, onOpen }: { readonly rows: readonly AuditEntry[]; readonly onOpen: (row: AuditEntry) => void }) {
  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <EntryCard key={row.id} row={row} onOpen={onOpen} />
      ))}
    </div>
  );
}

/**
 * The skeleton the phone sheet draws while a page is in flight (AuditLogPhone.dc.html:121-127):
 * four cards, not the table skeleton's eight rows of five bars, and each shaped like the card it
 * stands in for -- a short time bar, a wider action bar, then two blocks side by side.
 */
export function CardsLoading() {
  return (
    <div role="status" aria-busy="true" aria-label={m.entries.loading} className="flex flex-col">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex flex-col gap-2.5 border-t border-line px-4 py-3.5 first:border-t-0">
          <Skeleton className="h-2.5 w-[45%]" />
          <Skeleton className="h-3.5 w-[70%]" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
          </div>
        </div>
      ))}
    </div>
  );
}
