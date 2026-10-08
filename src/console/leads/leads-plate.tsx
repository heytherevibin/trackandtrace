import Link from "next/link";
import type { Route } from "next";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { StateBlock } from "@/components/ui/state-block";
import { PagerStep } from "@/console/components/pager-step";
import type { LeadRow } from "@/console/leads/leads";
import { NewsTag } from "@/console/leads/news-tag";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";
import { formatDate } from "@/utils/datetime";

const m = consoleMessages.leads;
const t = m.table;

/** A row as the page shows it now: its address is the revealed one once there is one. */
export interface ShownLead extends LeadRow {
  readonly shown: string;
  readonly hidden: boolean;
}

/** What the plate has to draw instead of rows, when it has none. */
export type LeadsState = "rows" | "noMatch" | "empty" | "filtered" | "error";

export interface LeadsPager {
  readonly range: string;
  readonly previous: Route | null;
  readonly next: Route | null;
}

/** The whole campaign: "google / cpc / diwali-2026". The cell draws its name; this is its tooltip. */
const campaignOf = (row: LeadRow): string => [row.campaign?.source, row.campaign?.medium, row.campaign?.name].filter((part): part is string => Boolean(part)).join(" / ");
/** What the Campaign cell draws: the name, or failing that whichever part there is. */
const campaignName = (row: LeadRow): string => row.campaign?.name ?? row.campaign?.source ?? row.campaign?.medium ?? t.blank;

// ConsoleLeads.dc.html's `.dt`: 36px rows, 14px gutters, 13px words, one line each.
//
// The sheet's column widths are drawn for a 1440 board, and they are kept from the width at which
// the table has room for them (1360px). Below it:
//   - every column takes what its words need, on 10px gutters;
//   - the Campaign column is not drawn. Ten columns do not fit a 1280 window beside the rail, and
//     the campaign is whole on the record.
//
// TAGS IS THE COLUMN THAT GIVES at every width: it takes what is left and cuts its tag with an
// ellipsis. A revealed address is wider than a masked one and is never cut, so its column grows and
// Tags gives it the room.
const GUTTER = "px-2.5 min-[1360px]:px-3.5";
const TH = `legend border-line h-9 whitespace-nowrap border-b text-left font-semibold ${GUTTER}`;
const TD = `border-line h-9 whitespace-nowrap border-b ${GUTTER}`;
const NARROW_HIDDEN = "max-[1359px]:hidden";
const COLUMNS: readonly (readonly [string, string])[] = [
  [t.email, "min-[1360px]:w-[146px]"],
  [t.news, "min-[1360px]:w-[162px]"],
  [t.lists, "min-[1360px]:w-[92px]"],
  [t.account, "min-[1360px]:w-[104px]"],
  [t.source, "min-[1360px]:w-[100px]"],
  [t.campaign, NARROW_HIDDEN],
  [t.tags, "w-full min-w-[96px]"],
  [t.firstSeen, "min-[1360px]:w-[104px]"],
  [t.lastActivity, "min-[1360px]:w-[108px]"],
];

/**
 * The Leads plate (ConsoleLeads.dc.html) and the phone board's cards. Drawn twice, a table from
 * `sm` up and cards below it, each `display: none` at the other width.
 *
 * NEWS AND ACCOUNT ARE SEPARATE COLUMNS, and the Account column says only whether there is one.
 * When they last signed in is in Last activity and on the record (decided at the sheet's review).
 *
 * A card is one link to the record and holds no button: on a phone an address is revealed on the
 * record, never in the list.
 */
export function LeadsPlate({
  state,
  rows,
  cell,
  pager,
  openId,
  revealing,
  hrefFor,
  clearHref,
  onReveal,
  onRetry,
}: {
  readonly state: LeadsState;
  readonly rows: readonly ShownLead[];
  /** The header's count cell: a range, "1 match", "No match", or a dash. */
  readonly cell: string;
  readonly pager: LeadsPager;
  /** The lead whose record is open: its row is marked, as the Drawer state draws it. */
  readonly openId: string | null;
  readonly revealing: string | null;
  readonly hrefFor: (row: LeadRow) => Route;
  readonly clearHref: Route;
  readonly onReveal: (row: ShownLead) => void;
  readonly onRetry: () => void;
}) {
  return (
    <Plate as="section" title={t.title} titleId="ld-leads" headingLevel={2} padding="none" meta={[<span key="count" className="tnum">{cell}</span>]}>
      {state === "error" ? (
        <StateBlock
          bare
          role="alert"
          headingLevel={3}
          title={m.states.errorTitle}
          detail={m.states.errorDetail}
          actions={
            <Button className="max-sm:h-11" onClick={onRetry}>
              {m.states.retry}
            </Button>
          }
        />
      ) : state === "noMatch" ? (
        <StateBlock bare headingLevel={3} title={m.states.noMatchTitle} detail={m.states.noMatchDetail} />
      ) : state === "empty" ? (
        <StateBlock bare headingLevel={3} title={m.states.emptyTitle} detail={m.states.emptyDetail} />
      ) : state === "filtered" ? (
        <StateBlock
          bare
          headingLevel={3}
          title={m.states.filteredTitle}
          detail={m.states.filteredDetail}
          actions={
            <Link href={clearHref} prefetch={false} className={buttonClassName({ className: "max-sm:h-11" })}>
              {m.filters.clear}
            </Link>
          }
        />
      ) : (
        <>
          {/* `relative`: the caption and the Actions heading are positioned off-screen for a screen
              reader, and an unpositioned scroller does not clip a positioned child. Without it they
              sat past the window's edge whenever the table scrolled, and the PAGE scrolled sideways. */}
          <div className="relative overflow-x-auto max-sm:hidden">
            <table className="text-label w-full border-collapse">
              <caption className="sr-only">{t.caption}</caption>
              <thead>
                <tr>
                  {COLUMNS.map(([header, width]) => (
                    <th key={header} scope="col" className={cn(TH, width)}>
                      {header}
                    </th>
                  ))}
                  <th scope="col" className={cn(TH, "min-[1360px]:w-[66px]")}>
                    <span className="sr-only">{t.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={row.id === openId ? "bg-accent-wash" : undefined}>
                    <td className={cn(TD, "text-sm")}>
                      <Link href={hrefFor(row)} prefetch={false} aria-label={t.open(row.shown)} className="text-accent-text underline-offset-4 hover:underline">
                        {row.shown}
                      </Link>
                    </td>
                    <td className={TD}>
                      <NewsTag status={row.news} />
                    </td>
                    <td className={TD}>{row.availability ? t.availability : t.blank}</td>
                    <td className={TD}>{m.account[row.account]}</td>
                    <td className={TD}>{m.sources[row.source]}</td>
                    <td className={cn(TD, NARROW_HIDDEN)}>
                      {row.campaign ? (
                        <span className="block max-w-[96px] truncate" title={campaignOf(row)}>
                          {campaignName(row)}
                        </span>
                      ) : (
                        t.blank
                      )}
                    </td>
                    {/* The first tag, and how many more: a row is one line. `max-w-0` under a full-width
                        column: it takes what is left and cuts the tag with an ellipsis, never pushes.
                        The rest are a hover away and on the record. */}
                    <td className={cn(TD, "max-w-0")}>
                      {row.tags[0] === undefined ? (
                        t.blank
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="bg-surface-1 text-2xs tracking-head text-ink-2 min-w-0 truncate px-2.5 py-[3px] leading-normal" title={row.tags[0]}>
                            {row.tags[0]}
                          </span>
                          {row.tags.length > 1 ? (
                            <span className="legend-sm shrink-0" title={row.tags.join(", ")}>
                              {t.moreTags(row.tags.length - 1)}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </td>
                    <td className={cn(TD, "tnum")}>{formatDate(row.firstSeen)}</td>
                    <td className={cn(TD, "tnum")}>{formatDate(row.lastActivity)}</td>
                    <td className="border-line h-9 whitespace-nowrap border-b px-1.5 text-right">
                      {row.hidden ? (
                        <Button variant="ghost" size="sm" aria-label={t.revealLabel(row.shown)} loading={revealing === row.id} onClick={() => onReveal(row)}>
                          {t.reveal}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul aria-label={t.caption} className="sm:hidden">
            {rows.map((row) => (
              <li key={row.id} className="border-line border-t first:border-t-0">
                <Link href={hrefFor(row)} prefetch={false} aria-label={t.open(row.shown)} className="press text-ink-1 hover:bg-accent-wash flex flex-col gap-1.5 px-4 py-3 no-underline">
                  <span className="flex items-center gap-2.5">
                    <span className="text-body min-w-0 grow font-medium leading-[22px] [overflow-wrap:anywhere]">{row.shown}</span>
                    <NewsTag status={row.news} />
                  </span>
                  <span className="text-sm leading-5">{m.account[row.account]}</span>
                  {row.tags.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5">
                      {row.tags.map((tag) => (
                        <Badge key={tag} variant="neutral">
                          {tag}
                        </Badge>
                      ))}
                    </span>
                  ) : null}
                  <span className="legend-sm tnum">{t.firstSeenLine(formatDate(row.firstSeen), m.sources[row.source])}</span>
                </Link>
              </li>
            ))}
          </ul>
          {/* One pager under both layouts: two would put two links named "Next" in the tree. */}
          <div className="max-sm:border-line flex items-center gap-2 px-3.5 py-2.5 max-sm:border-t max-sm:px-4">
            <span className="legend tnum grow">{pager.range}</span>
            <PagerStep href={pager.previous}>{t.previous}</PagerStep>
            <PagerStep href={pager.next}>{t.next}</PagerStep>
          </div>
        </>
      )}
    </Plate>
  );
}
