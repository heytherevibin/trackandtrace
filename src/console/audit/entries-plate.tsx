"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Plate } from "@/components/ui/plate";
import { Skeleton } from "@/components/ui/skeleton";
import { StateBlock } from "@/components/ui/state-block";
import { consoleApiMessage } from "@/console/api-message";
import type { AuditEntry, AuditPage } from "@/console/audit/audit";
import { readAuditPage } from "@/console/audit/audit-client";
import { EntryDrawer } from "@/console/audit/entry-drawer";
import { AuditExportButton, AuditExportProvider, AuditExportStatus } from "@/console/audit/export-dialog";
import { FilterBar, type AuditMemberOption } from "@/console/audit/filter-bar";
import { AUDIT_PAGE_SIZE, auditFiltersToSearch, clearAuditFilters, type AuditFilters } from "@/console/audit/filters";
import { consoleMessages } from "@/console/messages";
import { log } from "@/services/log";
import { formatDateTime, formatTime } from "@/utils/datetime";

const m = consoleMessages.audit;
const f = consoleMessages.frame;

const EMPTY: AuditPage = { rows: [], total: 0 };

type Status = "ready" | "loading" | "error";

/**
 * The actors named by a set of rows. This is the only roster module 14 can reach: `console_team` is
 * Owner-only and the audit log is Owner+Admin, so an Admin filtering by member has no other source
 * for the names -- and the System rows, which have no actor at all, are not members to filter by.
 */
function actorsIn(rows: readonly AuditEntry[]): readonly AuditMemberOption[] {
  return [...new Map(rows.flatMap((row) => (row.actorId ? ([[row.actorId, { id: row.actorId, name: row.actorName }]] as const) : []))).values()];
}

/**
 * Every actor seen so far, not merely those on the page in hand: filtering by one member would
 * otherwise narrow the rows to that member and so narrow the picker to them alone, leaving no way
 * to switch to another without clearing the filter first.
 */
function withActors(known: readonly AuditMemberOption[], rows: readonly AuditEntry[]): readonly AuditMemberOption[] {
  const merged = new Map(known.map((one) => [one.id, one]));
  for (const one of actorsIn(rows)) merged.set(one.id, one);
  return [...merged.values()];
}

function columns(onOpen: (row: AuditEntry) => void): readonly Column<AuditEntry>[] {
  // AuditLog.dc.html:160's own columns, in the sheet's own relative order, with one undrawn column
  // inserted second (see below). Every `header` is a plain string: DataTable also prints it into
  // `data-label` for the stacked phone layout, where a ReactNode becomes "[object Object]" with no
  // React warning (task-2-addendum.md §6).
  return [
    // `whitespace-nowrap`, because the sheet fixes this column at 168px and one line (:160). With
    // nine columns on a 1280 board behind a 240px rail there is no room to spare, and a wrapped
    // "22 Sept 2026, 18:14 IST" broke over four lines in the first real rendering of this page --
    // the table scrolls sideways (DataTable's own `overflow-x-auto`) rather than shredding a
    // timestamp. Caught by the e2e run's screenshot; jsdom has no layout to catch it with.
    {
      key: "time",
      header: m.entries.columns.time,
      numeric: true,
      cell: (row) => <span className="whitespace-nowrap">{`${formatDateTime(row.at)} ${consoleMessages.frameSignedIn.clock.ist}`}</span>,
    },
    // Not drawn -- the sheet predates the ruling. Non-negotiable all the same (task-2-addendum.md
    // §4): a log that shows a preview deployment's row as though it were production's lies, and
    // that is the one thing this module must never do.
    //
    // Second, not last, and that placement is the ruling rather than taste. Appended after Address
    // it was the first column to leave the screen when the table outgrew its scroller -- still
    // reachable, but the column that must always be readable should not be the one a reader has to
    // go looking for. Beside the time is also where it belongs: both say where a record came from
    // rather than what it says. The drawn columns keep their own order among themselves.
    { key: "environment", header: m.entries.columns.environment, cell: (row) => row.environment },
    {
      key: "member",
      header: m.entries.columns.member,
      cell: (row) => (
        <span className="inline-flex items-center gap-2">
          <span>{row.actorName}</span>
          {/* The sheet's `hasRole` (:166): the System row has no role and gets no tag rather than an empty one. */}
          {row.actorRole ? <Badge variant="neutral">{f.roleLabel[row.actorRole]}</Badge> : null}
        </span>
      ),
    },
    { key: "action", header: m.entries.columns.action, cell: (row) => row.action },
    { key: "target", header: m.entries.columns.target, cell: (row) => row.target ?? m.entries.none },
    { key: "reason", header: m.entries.columns.reason, cell: (row) => (row.reason ? m.entries.quoted(row.reason) : m.entries.none) },
    { key: "result", header: m.entries.columns.result, cell: (row) => <Badge variant={row.result === "done" ? "outline" : "neutral"}>{m.results[row.result]}</Badge> },
    { key: "address", header: m.entries.columns.address, cell: (row) => <span className="tnum">{row.addressHash ?? m.entries.none}</span> },
    // The sheet's ninth column (:160): the header lives in a visually-hidden span, because every
    // cell under it says the same word, and each control carries the sheet's own accessible name --
    // "Open the entry: Paused PNR checks at 14:02 IST". The row's time to the minute, as the
    // sheet's own openLabel composes it from the table's cell rather than the drawer's.
    //
    // A button, where the sheet draws `<a href="#">`: the drawer has no address of its own, and a
    // link to nowhere is a control a keyboard reaches and a screen reader announces wrongly. The
    // accessible name still begins with the visible word, so a member saying "Open" is understood.
    {
      key: "open",
      header: m.entries.columns.open,
      hideHeader: true,
      align: "end",
      cell: (row) => (
        <Button variant="ghost" size="sm" aria-label={m.entries.open(row.action, `${formatTime(row.at)} ${consoleMessages.frameSignedIn.clock.ist}`)} onClick={() => onOpen(row)}>
          {m.entries.columns.open}
        </Button>
      ),
    },
  ];
}

/** The skeleton the sheet draws while a page is in flight (AuditLog.dc.html:184-191). */
function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label={m.entries.loading} className="flex flex-col">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
        <div key={row} className="flex h-9 items-center gap-6 border-b border-line px-3.5">
          <Skeleton className="h-3 w-[130px]" />
          <Skeleton className="h-3 w-[120px]" />
          <Skeleton className="h-3 w-[160px]" />
          <Skeleton className="h-3 w-[110px]" />
          <Skeleton className="h-3 grow" />
        </div>
      ))}
    </div>
  );
}

/**
 * The filter bar, the chip row and the Entries plate -- the whole table area
 * (AuditLog.dc.html:109-211), and the one client component on this page.
 *
 * It holds the state because the two halves share it: the bar decides what is asked for and the
 * plate shows what came back, and the page above them is a server component that cannot hold
 * anything. The alternative -- letting each filter change re-render the page server-side -- is
 * ruled out by the shape of this module rather than by taste: **the page's server render is what
 * writes the "Opened the audit log" row** (task-2-addendum.md §5), so filtering through the server
 * would write one row per keystroke into an append-only log. Filters still live in the address, put
 * there with `history.replaceState`, which Next supports precisely so a URL can be updated without
 * a server round trip -- so a filtered view is still linkable and still survives a reload, and a
 * reload is the one thing that legitimately counts as opening the log again.
 *
 * It draws the page header too, which is not where a component called "the entries plate" would
 * naturally put it -- and it is the only place it can go. `Export CSV` is drawn in the header's own
 * actions (:90-96), the two export status rows are drawn down here between the chip row and the
 * plate (:136-147), and both are one export: the control has to reach the live filters and the
 * live total, which live in this component and nowhere else. A server-rendered header above a
 * client island could reach neither. `AuditExportProvider` is what joins them, so neither the
 * header nor the plate owns the export.
 *
 * The browser-side read now lives in `src/console/audit/audit-client.ts` (Task 4's file to create),
 * where the export's own request sits beside it.
 *
 * `initial` is `null` when the page's own server-side read failed -- the sheet draws an in-page
 * error state for this module (:201-208), unlike /keys, whose brief quoted none and which therefore
 * leaves a failed read to the console's error boundary.
 */
export function EntriesPlate({
  initial,
  filters: initialFilters,
  environment,
}: {
  readonly initial: AuditPage | null;
  readonly filters: AuditFilters;
  readonly environment: string;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState<AuditPage>(initial ?? EMPTY);
  const [status, setStatus] = useState<Status>(initial ? "ready" : "error");
  const [members, setMembers] = useState<readonly AuditMemberOption[]>(() => actorsIn(initial?.rows ?? []));
  // The id alone, not the row: the drawer reads the entry itself, because the key's *name* is not
  // in any row the table holds (task-3-addendum.md §2). Holding the row here would invite drawing
  // the drawer from it and quietly losing the key clause.
  const [openId, setOpenId] = useState<string | null>(null);
  // Only the newest read may paint: a member who changes two filters quickly would otherwise see
  // whichever request happened to finish last.
  const request = useRef(0);

  const read = useCallback(
    async (next: AuditFilters) => {
      const mine = ++request.current;
      setStatus("loading");
      const result = await readAuditPage(next, environment);
      if (mine !== request.current) return;
      if (!result.ok) {
        // consoleApiMessage is the one thing that decides what a failed console request says
        // (task-2-addendum.md §7). The sheet's error state has no slot for it, so it is logged
        // rather than dropped -- a database refusal is a developer string and must never be shown.
        log.warn("[console] the audit log could not be re-read", { message: consoleApiMessage(result.error) });
        setStatus("error");
        return;
      }
      setPage({ rows: result.data.rows, total: result.data.total });
      setMembers((known) => withActors(known, result.data.rows));
      setStatus("ready");
    },
    [environment],
  );

  // The address follows the filters without re-rendering the page: history.replaceState is Next's
  // own supported way to do that, and it keeps a filtered view linkable and reloadable.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = auditFiltersToSearch(filters, environment);
    if (window.location.search !== search) window.history.replaceState(null, "", `${window.location.pathname}${search}`);
  }, [filters, environment]);

  const apply = (next: AuditFilters) => {
    setFilters(next);
    void read(next);
  };

  // What is on screen, not what a full page would hold: the last page is short, and so is any page
  // the database answered with fewer rows than were asked for.
  const first = page.rows.length === 0 ? 0 : (filters.page - 1) * AUDIT_PAGE_SIZE + 1;
  const last = first === 0 ? 0 : first + page.rows.length - 1;
  const rangeLabel = m.filters.ranges[filters.range];

  return (
    <AuditExportProvider filters={filters} total={page.total}>
      <div className="flex flex-col gap-8">
        {/*
          AuditLog.dc.html:90 draws `Export CSV` in the page header's `ph-actions`, behind the
          sheet's own `canExport` (:351, `!noAccess`). There is no prop for that here because there
          is nothing left for it to decide: a role below module 14's floor never reaches this
          component at all -- the page answered it with NoAccessState -- so on this page `canExport`
          is the same fact as "this component is rendering", exactly as src/app/console/team/page.tsx
          reasons about its own `canManage`.

          The phone is a different question and not this task's: AuditLogPhone.dc.html:64 replaces
          this control with "Open on a larger screen to export." Task 5 owns that, and the control is
          one element in one slot so that removing it there is one line.
        */}
        <PageHeader kicker={m.kicker} title={m.title} lead={m.lead} actions={<AuditExportButton />} />

        <div className="flex flex-col gap-4">
          <FilterBar filters={filters} environment={environment} members={members} onChange={apply} />

          {/* Between the chip row and the Entries plate, where the sheet draws both of them (:136-147). */}
          <AuditExportStatus />

          <Plate as="section" title={m.entries.title} titleId="audit-entries" headingLevel={2} meta={[m.entries.rangeCell(rangeLabel, page.total)]} padding="none">
            {status === "loading" ? (
              <Loading />
            ) : status === "error" ? (
              // role="alert", as the sheet draws this state and only this one (:202).
              <StateBlock bare role="alert" title={m.error.title} detail={m.error.detail} actions={<Button onClick={() => void read(filters)}>{m.error.action}</Button>} />
            ) : page.rows.length === 0 ? (
              <StateBlock bare title={m.empty.title} detail={m.empty.detail} actions={<Button onClick={() => apply(clearAuditFilters(filters, environment))}>{m.empty.action}</Button>} />
            ) : (
              <>
                <DataTable columns={columns((row) => setOpenId(row.id))} rows={page.rows} rowKey={(row) => row.id} caption={m.entries.caption[filters.range]} />
                <div className="flex items-center gap-2 px-3.5 py-2.5">
                  <span className="legend grow">{m.entries.pageRange(first, last, page.total)}</span>
                  <Button size="sm" disabled={filters.page <= 1} onClick={() => apply({ ...filters, page: filters.page - 1 })}>
                    {m.entries.previous}
                  </Button>
                  <Button size="sm" disabled={last >= page.total} onClick={() => apply({ ...filters, page: filters.page + 1 })}>
                    {m.entries.next}
                  </Button>
                </div>
              </>
            )}
          </Plate>

          {/* Outside the plate, as the sheet draws it (:215): the drawer is a plate of its own over
              the board, not something nested inside the Entries plate -- plates do not nest. */}
          <EntryDrawer entryId={openId} onClose={() => setOpenId(null)} />
        </div>
      </div>
    </AuditExportProvider>
  );
}
