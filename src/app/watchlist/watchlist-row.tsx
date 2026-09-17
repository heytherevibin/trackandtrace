"use client";

import Link from "next/link";
import { ArrowSyncRegular, DeleteRegular } from "@/components/icons";
import { IconButton } from "@/components/ui/icon-button";
import { StatusPill } from "@/components/ui/status-pill";
import { messages } from "@/messages";
import type { WatchlistEntry } from "@/types/domain";
import { formatDateTime, formatRelative } from "@/utils/datetime";
import { formatPnr } from "@/utils/pnr";

export function lastCheck(entry: WatchlistEntry) {
  return entry.checks[entry.checks.length - 1] ?? null;
}

export function PnrCell({ entry }: { readonly entry: WatchlistEntry }) {
  return (
    <Link href={`/pnr/${entry.pnr}`} className="font-data font-medium text-ink-1 underline-offset-4 hover:underline">
      {formatPnr(entry.pnr)}
    </Link>
  );
}

export function StatusCell({ entry }: { readonly entry: WatchlistEntry }) {
  const last = lastCheck(entry);
  if (!last) return <span className="text-ink-3">{messages.watchlist.noChecks}</span>;
  const positions = entry.checks.map((c) => c.position).filter((p): p is number => typeof p === "number");
  return (
    <span className="flex flex-wrap items-center gap-2">
      <StatusPill status={last.status} position={last.position} size="sm" />
      {positions.length > 1 ? <span className="font-data text-xs text-ink-3">{positions.slice(-4).join(" → ")}</span> : null}
    </span>
  );
}

export function CheckedCell({ entry }: { readonly entry: WatchlistEntry }) {
  const last = lastCheck(entry);
  if (!last) return <span className="text-ink-3">—</span>;
  return (
    <span className="flex flex-col">
      <span title={formatDateTime(last.at)}>{formatRelative(last.at)}</span>
      <span className="text-xs text-ink-3">{messages.watchlist.checksCount(entry.checks.length)}</span>
    </span>
  );
}

export function ActionsCell({ entry, busy, onRecheck, onRemove }: { readonly entry: WatchlistEntry; readonly busy: boolean; readonly onRecheck: (pnr: string) => void; readonly onRemove: (pnr: string) => void }) {
  const m = messages.watchlist;
  return (
    <span className="flex items-center gap-1">
      <IconButton label={`${m.recheck} ${formatPnr(entry.pnr)}`} icon={<ArrowSyncRegular className="size-5" aria-hidden="true" />} variant="secondary" size="sm" loading={busy} onClick={() => onRecheck(entry.pnr)} data-testid="watchlist-recheck" />
      <IconButton label={`${m.remove} ${formatPnr(entry.pnr)}`} icon={<DeleteRegular className="size-5" aria-hidden="true" />} variant="ghost" size="sm" onClick={() => onRemove(entry.pnr)} data-testid="watchlist-remove" />
    </span>
  );
}
