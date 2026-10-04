import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { Button, buttonClassName } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { StateBlock } from "@/components/ui/state-block";
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

const campaignOf = (row: LeadRow): string => [row.campaign?.source, row.campaign?.medium, row.campaign?.name].filter((part): part is string => Boolean(part)).join(" / ") || t.blank;

// ConsoleLeads.dc.html's `.dt`: 36px rows, 14px gutters, 13px words, one line each.
//
// The sheet's column widths are drawn for a 1440 board, and they are kept from the width at which
// the table has room for them. Below it every column takes what its words need and Campaign, the
// one column that can be cut, takes what is left: at 1280 the drawn widths add up to more than the
// plate, and the table scrolled sideways with Reveal half off its edge.
//
// A column is never narrower than its words at any width, so a revealed address is never cut.
//
// The 14px gutters come in at the same width, 10px below it: the 72px that gives back is what lets
// a revealed address widen its column at 1280 without pushing Reveal past the plate's edge.
const GUTTER = "px-2.5 min-[1360px]:px-3.5";
const TH = `legend border-line h-9 whitespace-nowrap border-b text-left font-semibold ${GUTTER}`;
const TD = `border-line h-9 whitespace-nowrap border-b ${GUTTER}`;
const COLUMNS: readonly (readonly [string, string])[] = [
  [t.email, "min-[1360px]:w-[146px]"],
  [t.news, "min-[1360px]:w-[162px]"],
  [t.lists, "min-[1360px]:w-[92px]"],
  [t.account, "min-[1360px]:w-[120px]"],
  [t.source, "min-[1360px]:w-[106px]"],
  [t.campaign, "w-full min-w-[88px]"],
  [t.firstSeen, "min-[1360px]:w-[108px]"],
  [t.lastActivity, "min-[1360px]:w-[112px]"],
];

function PagerStep({ href, children }: { readonly href: Route | null; readonly children: ReactNode }) {
  // Nowhere to go is a disabled button, as drawn, and not a link: a link must lead somewhere.
  if (href === null) {
    return (
      <Button size="sm" className="max-sm:h-11" disabled>
        {children}
      </Button>
    );
  }
  return (
    <Link href={href} prefetch={false} className={buttonClassName({ size: "sm", className: "max-sm:h-11" })}>
      {children}
    </Link>
  );
}

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
          <div className="overflow-x-auto max-sm:hidden">
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
                    {/* `max-w-0` under a full-width column: it takes what is left and cuts with an ellipsis, never pushes. */}
                    <td className={cn(TD, "max-w-0 truncate")} title={row.campaign ? campaignOf(row) : undefined}>
                      {campaignOf(row)}
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
