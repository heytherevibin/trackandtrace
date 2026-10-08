import Link from "next/link";
import type { Route } from "next";
import { Button, buttonClassName } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { StateBlock } from "@/components/ui/state-block";
import type { AccountRow } from "@/console/accounts/accounts";
import { signInLine } from "@/console/accounts/sign-in";
import { PagerStep } from "@/console/components/pager-step";
import { consoleHref } from "@/console/href";
import { leadRecordHref } from "@/console/leads/filters";
import { NewsTag } from "@/console/leads/news-tag";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";
import { formatCount, formatDate } from "@/utils/datetime";

const m = consoleMessages.accounts;
const t = m.table;
const news = consoleMessages.leads.news;

/** A row as the page shows it now: its address is the revealed one once there is one. */
export interface ShownAccount extends AccountRow {
  readonly shown: string;
  readonly hidden: boolean;
}

/** What the plate has to draw instead of rows, when it has none. */
export type AccountsState = "rows" | "noMatch" | "empty" | "filtered" | "error";

export interface AccountsPager {
  readonly range: string;
  readonly previous: Route | null;
  readonly next: Route | null;
}

/** The same person in Leads: the list there, with their record open over it. */
export const leadHref = (row: Pick<AccountRow, "leadId">): Route => leadRecordHref(consoleHref("/leads"), row.leadId);

/** Disabled is a tag, in the sheet's one box; Active is plain words. */
export function StatusTag({ disabled }: { readonly disabled: boolean }) {
  if (!disabled) return <>{m.status.active}</>;
  return <span className="border-line-strong text-ink-1 text-2xs tracking-head inline-flex items-center whitespace-nowrap border px-2.5 py-[3px] leading-normal">{m.status.disabled}</span>;
}

// ConsoleAccounts.dc.html's `.dt`: 36px rows, 14px gutters, 13px words, one line each.
//
// The sheet's column widths are drawn for a 1440 board, and they are kept from the width at which
// the table has room for them (1360px). Below it every column takes what its words need, on 10px
// gutters, as the Leads table does.
//
// SIGN-IN IS THE COLUMN THAT GIVES at every width: it takes what is left and cuts its words with
// an ellipsis, the whole of them a hover away and on the record. A revealed address is wider than a
// masked one and is never cut, so its column grows and Sign-in gives it the room.
const GUTTER = "px-2.5 min-[1360px]:px-3.5";
const TH = `legend border-line h-9 whitespace-nowrap border-b text-left font-semibold ${GUTTER}`;
const TD = `border-line h-9 whitespace-nowrap border-b ${GUTTER}`;
const COLUMNS: readonly (readonly [string, string])[] = [
  [t.email, "min-[1360px]:w-[170px]"],
  [t.created, "min-[1360px]:w-[120px]"],
  [t.lastSignIn, "min-[1360px]:w-[120px]"],
  [t.signIn, "w-full min-w-[96px]"],
  [t.savedPnrs, "min-[1360px]:w-[112px]"],
  [t.news, "min-[1360px]:w-[184px]"],
  [t.status, "min-[1360px]:w-[112px]"],
];

/**
 * The Accounts plate (ConsoleAccounts.dc.html) and the phone board's cards. Drawn twice, a table
 * from `sm` up and cards below it, each `display: none` at the other width.
 *
 * SAVED PNRS IS A NUMBER, and that is all this page is ever given about them.
 *
 * The News tag is a link to the same person in Leads. A card is one link to the record and holds
 * no other: on a phone an address is revealed, and a lead opened, from the record.
 */
export function AccountsPlate({
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
  readonly state: AccountsState;
  readonly rows: readonly ShownAccount[];
  /** The header's count cell: a range, "1 match", "No match", or a dash. */
  readonly cell: string;
  readonly pager: AccountsPager;
  /** The account whose record is open: its row is marked, as the Record state draws it. */
  readonly openId: string | null;
  readonly revealing: string | null;
  readonly hrefFor: (row: AccountRow) => Route;
  readonly clearHref: Route;
  readonly onReveal: (row: ShownAccount) => void;
  readonly onRetry: () => void;
}) {
  return (
    <Plate as="section" title={t.title} titleId="ac-accounts" headingLevel={2} padding="none" meta={[<span key="count" className="tnum">{cell}</span>]}>
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
              reader, and an unpositioned scroller does not clip a positioned child. */}
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
                    <td className={cn(TD, "tnum")}>{formatDate(row.createdAt)}</td>
                    <td className={cn(TD, "tnum")}>{row.lastSignInAt ? formatDate(row.lastSignInAt) : t.never}</td>
                    {/* `max-w-0` under a full-width column: it takes what is left and cuts with an
                        ellipsis, never pushes. */}
                    <td className={cn(TD, "max-w-0")}>
                      <span className="block truncate" title={signInLine(row)}>
                        {signInLine(row)}
                      </span>
                    </td>
                    <td className={cn(TD, "tnum")}>{formatCount(row.savedPnrs)}</td>
                    <td className={TD}>
                      <Link href={leadHref(row)} prefetch={false} aria-label={t.openLead(news[row.news], row.shown)} className="inline-flex no-underline">
                        <NewsTag status={row.news} />
                      </Link>
                    </td>
                    <td className={TD}>
                      <StatusTag disabled={row.disabled} />
                    </td>
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
                    {row.disabled ? <StatusTag disabled /> : null}
                  </span>
                  <span className="text-sm leading-5">{signInLine(row)}</span>
                  <span className="text-ink-2 text-sm leading-5">{t.savedLine(row.savedPnrs, news[row.news])}</span>
                  <span className="legend-sm tnum">{t.datesLine(formatDate(row.createdAt), row.lastSignInAt ? formatDate(row.lastSignInAt) : null)}</span>
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
