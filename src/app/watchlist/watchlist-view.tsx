"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonClassName } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { notify } from "@/components/ui/toast";
import { messages } from "@/messages";
import { fetchPnr } from "@/services/pnr-source";
import { mergePromptStore, planMerge } from "@/services/stores/watchlist-merge";
import { useWatchlist, watchlistStore } from "@/services/stores/watchlist-store";
import { deleteWatchlist, mergeWatchlist, saveWatchlist } from "@/services/watchlist-api";
import type { HistoryPoint, WatchlistEntry } from "@/types/domain";
import { statusLabel } from "@/utils/status-tone";
import { MergePrompt } from "./merge-prompt";
import { ActionsCell, CheckedCell, PnrCell, StatusCell, lastCheck } from "./watchlist-row";

export interface WatchlistViewProps {
  readonly signedIn: boolean;
  readonly initialEntries: readonly WatchlistEntry[];
  readonly loadError: boolean;
}

/** Dual-mode watchlist: device entries when signed out, account entries when signed in. */
export function WatchlistView({ signedIn, initialEntries, loadError }: WatchlistViewProps) {
  const m = messages.watchlist;
  const router = useRouter();
  const local = useWatchlist();
  const [server, setServer] = useState<readonly WatchlistEntry[]>(initialEntries);
  const [busy, setBusy] = useState<string | null>(null);
  const [mergeDismissed, setMergeDismissed] = useState(false);
  const [mergeEligible] = useState(() => mergePromptStore.shouldPrompt());
  const [announcement, setAnnouncement] = useState("");
  const entries = signedIn ? server : local.entries;
  const mergePlan = signedIn ? planMerge(local.entries, server) : null;
  const mergeCount = mergePlan ? mergePlan.create.length + mergePlan.update.length : 0;
  const mergeOpen = signedIn && mergeEligible && !mergeDismissed && mergeCount > 0;

  const recheck = async (pnr: string) => {
    const before = entries.find((e) => e.pnr === pnr);
    const previous = before ? lastCheck(before) : null;
    setBusy(pnr);
    const out = await fetchPnr(pnr, { fresh: true });
    setBusy(null);
    if (!out.outcome.ok) {
      notify.error(m.recheckFailed, out.outcome.message);
      return;
    }
    const result = out.outcome.result;
    const point: HistoryPoint = { at: result.checkedAt, status: result.lead.status, position: result.lead.position };
    const nowLabel = statusLabel(point.status, point.position);
    const message = previous && (previous.status !== point.status || previous.position !== point.position) ? m.recheckUpdated(statusLabel(previous.status, previous.position), nowLabel) : m.recheckSame(nowLabel);
    if (signedIn && before) {
      const saved = await saveWatchlist({ pnr, label: before.label, checks: [...before.checks, point].slice(-40) });
      if (!saved.ok) {
        notify.error(m.recheckFailed, saved.error.message);
        return;
      }
      setServer((list) => list.map((e) => (e.pnr === pnr ? saved.data : e)));
    } else {
      watchlistStore.appendCheck(pnr, point);
    }
    setAnnouncement(`${pnr}: ${message}`);
    notify.success(message);
  };

  const remove = async (pnr: string) => {
    const removed = entries.find((e) => e.pnr === pnr);
    if (!removed) return;
    if (signedIn) {
      setServer((list) => list.filter((e) => e.pnr !== pnr));
      const out = await deleteWatchlist(pnr);
      if (!out.ok) {
        setServer((list) => [removed, ...list]);
        notify.error(m.removeFailed, out.error.message);
        return;
      }
      notify.undoable(m.removed(pnr), () => {
        void saveWatchlist({ pnr: removed.pnr, label: removed.label, checks: removed.checks }).then((back) => {
          if (back.ok) {
            setServer((list) => [back.data, ...list.filter((e) => e.pnr !== pnr)]);
            notify.success(m.restored);
          }
        });
      });
    } else {
      local.remove(pnr);
      notify.undoable(m.removed(pnr), () => {
        watchlistStore.upsert(removed.pnr, removed.label, removed.checks[removed.checks.length - 1]);
        notify.success(m.restored);
      });
    }
  };

  const move = async () => {
    if (!mergePlan) return;
    const payload = [...mergePlan.create, ...mergePlan.update].map((e) => ({ pnr: e.pnr, label: e.label, checks: e.checks }));
    const out = await mergeWatchlist(payload);
    if (!out.ok) {
      notify.error(m.merge.failed, out.error.message);
      return;
    }
    setServer(out.data);
    local.clear();
    setMergeDismissed(true);
    notify.success(m.merge.moved(payload.length));
  };

  const columns = [
    { key: "pnr", header: m.columns.pnr, cell: (e: WatchlistEntry) => <PnrCell entry={e} /> },
    { key: "journey", header: m.columns.journey, cell: (e: WatchlistEntry) => <span className="text-ink-2">{e.label}</span> },
    { key: "status", header: m.columns.status, cell: (e: WatchlistEntry) => <StatusCell entry={e} /> },
    { key: "checked", header: m.columns.checked, cell: (e: WatchlistEntry) => <CheckedCell entry={e} /> },
    { key: "actions", header: m.columns.actions, cell: (e: WatchlistEntry) => <ActionsCell entry={e} busy={busy === e.pnr} onRecheck={(p) => void recheck(p)} onRemove={(p) => void remove(p)} />, align: "end" as const },
  ];

  return (
    <section className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-8 sm:px-6">
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      <PageHeader
        title={m.title}
        lead={signedIn ? m.signedLead : m.anonLead}
        meta={<span>{m.count(entries.length)}</span>}
        actions={
          signedIn ? null : (
            <Link href="/login" className={buttonClassName({ variant: "key", size: "sm" })}>
              {messages.shell.nav.signIn}
            </Link>
          )
        }
      />
      {loadError ? (
        <ErrorState title={m.loadError} onRetry={() => router.refresh()} />
      ) : (
        <div className="panel overflow-hidden">
          <DataTable
            caption={m.title}
            rows={entries}
            rowKey={(e) => e.pnr}
            columns={columns}
            emptyState={
              <EmptyState
                title={messages.states.empty.watchlistTitle}
                detail={messages.states.empty.watchlistDetail}
                actions={
                  <Link href="/" className={buttonClassName({ variant: "primary" })}>
                    {m.empty.action}
                  </Link>
                }
              />
            }
          />
        </div>
      )}
      {!signedIn && local.entries.length > 0 ? (
        <div>
          <Button variant="ghost" size="sm" onClick={local.clear}>
            {m.clearLocal}
          </Button>
        </div>
      ) : null}
      {mergePlan ? (
        <MergePrompt
          count={mergeCount}
          open={mergeOpen}
          onMove={move}
          onDismiss={(never) => {
            if (never) mergePromptStore.never();
            else mergePromptStore.snooze();
            setMergeDismissed(true);
          }}
        />
      ) : null}
    </section>
  );
}
