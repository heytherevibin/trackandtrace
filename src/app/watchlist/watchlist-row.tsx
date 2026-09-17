"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { messages } from "@/messages";
import type { WatchlistEntry } from "@/types/domain";
import { formatDateTime } from "@/utils/datetime";
import { formatPnr } from "@/utils/pnr";
import { statusDescription, statusLabel } from "@/utils/status-tone";
import { checkedAgo, lastCheck, trendLabel } from "./watchlist-format";

// One saved PNR, as the Watchlist sheet draws a row: cells 12×20 on a hairline.

const CELL = "border-b border-line px-5 py-3";
const META = "text-xs leading-normal text-ink-1/65";

export interface WatchlistRowProps {
  readonly entry: WatchlistEntry;
  readonly busy: boolean;
  readonly onRecheck: (pnr: string) => void;
  readonly onRemove: (pnr: string) => void;
}

export function WatchlistRow({ entry, busy, onRecheck, onRemove }: WatchlistRowProps) {
  const m = messages.watchlist;
  const last = lastCheck(entry);
  const trend = trendLabel(entry.checks);
  const pnr = formatPnr(entry.pnr);

  return (
    <tr>
      <td className={`${CELL} font-data text-base leading-normal tracking-wide`}>
        <Link href={`/pnr/${entry.pnr}`} className="text-ink-1 no-underline hover:text-ink-1 hover:underline">
          {pnr}
        </Link>
      </td>
      <td className={`${CELL} tnum text-ink-1/74`}>{entry.label}</td>
      <td className={CELL}>
        {last ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge variant="accent" title={statusDescription(last.status)} data-status={last.status} className="border-0 leading-normal">
              {statusLabel(last.status, last.position)}
            </Badge>
            <span className="sr-only">{statusDescription(last.status)}</span>
            {trend ? <span className={`${META} tnum`}>{trend}</span> : null}
          </span>
        ) : (
          <span className={META}>{m.noChecks}</span>
        )}
      </td>
      <td className={CELL}>
        {last ? (
          <span className="flex flex-col">
            <time dateTime={last.at} title={formatDateTime(last.at)} className="tnum" suppressHydrationWarning>
              {checkedAgo(last.at)}
            </time>
            <span className={META}>{m.checksCount(entry.checks.length)}</span>
          </span>
        ) : (
          <span className={META}>{m.checksCount(0)}</span>
        )}
      </td>
      <td className={`${CELL} whitespace-nowrap text-right`}>
        <Button variant="secondary" className="mr-2" aria-busy={busy || undefined} onClick={() => onRecheck(entry.pnr)} data-testid="watchlist-recheck">
          {busy ? m.checking : m.recheck}
          <span className="sr-only"> {pnr}</span>
        </Button>
        <Button variant="ghost" onClick={() => onRemove(entry.pnr)} data-testid="watchlist-remove">
          {m.remove}
          <span className="sr-only"> {pnr}</span>
        </Button>
      </td>
    </tr>
  );
}
