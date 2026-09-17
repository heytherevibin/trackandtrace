"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Button, buttonClassName } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { messages } from "@/messages";
import { fetchPnr } from "@/services/pnr-source";
import { mergePromptStore, planMerge } from "@/services/stores/watchlist-merge";
import { useWatchlist, watchlistStore } from "@/services/stores/watchlist-store";
import { deleteWatchlist, mergeWatchlist, saveWatchlist } from "@/services/watchlist-api";
import type { HistoryPoint, WatchlistEntry } from "@/types/domain";
import { formatPnr } from "@/utils/pnr";
import { statusLabel } from "@/utils/status-tone";
import { MergePrompt } from "./merge-prompt";
import { lastCheck, restoreAt } from "./watchlist-format";
import { BUTTON_LEADING } from "./watchlist-row";
import { EmptyPlate, SavedPlate, SyncNote, UndoButton } from "./watchlist-plates";
import { CountSkeleton, SavedPlateSkeleton } from "./watchlist-skeleton";

export interface WatchlistViewProps {
  readonly signedIn: boolean;
  readonly initialEntries: readonly WatchlistEntry[];
  readonly loadError: boolean;
  /** True only while the labelled development fixture serves results. */
  readonly sampleData: boolean;
}

const subscribeNever = () => () => undefined;
const onClient = () => true;
const onServer = () => false;

/** Puts a removed device entry back through the store, every saved check included. */
function restoreLocal(entry: WatchlistEntry): void {
  const [first, ...rest] = entry.checks;
  watchlistStore.upsert(entry.pnr, entry.label, first);
  for (const point of rest) watchlistStore.appendCheck(entry.pnr, point);
}

/** The Watchlist sheet. Device entries when signed out, account entries when signed in. */
export function WatchlistView({ signedIn, initialEntries, loadError, sampleData }: WatchlistViewProps) {
  const m = messages.watchlist;
  const router = useRouter();
  const local = useWatchlist();
  // Device entries exist only in the browser: until hydration, draw the plate in outline, not as empty.
  const hydrated = useSyncExternalStore(subscribeNever, onClient, onServer);
  const [server, setServer] = useState<readonly WatchlistEntry[]>(initialEntries);
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [removed, setRemoved] = useState<WatchlistEntry | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [mergeDismissed, setMergeDismissed] = useState(false);
  const [mergeEligible] = useState(() => mergePromptStore.shouldPrompt());

  const entries: readonly WatchlistEntry[] = signedIn ? server : local.entries;
  const ready = signedIn || hydrated;
  const mergePlan = signedIn ? planMerge(local.entries, server) : null;
  const mergeCount = mergePlan ? mergePlan.create.length + mergePlan.update.length : 0;
  const mergeOpen = signedIn && mergeEligible && !mergeDismissed && mergeCount > 0;

  const setPnrBusy = (pnr: string, on: boolean) =>
    setBusy((current) => new Set(on ? [...current, pnr] : [...current].filter((p) => p !== pnr)));

  const recheck = async (pnr: string) => {
    if (busy.has(pnr)) return;
    const before = entries.find((e) => e.pnr === pnr);
    const previous = before ? lastCheck(before) : null;
    const shown = formatPnr(pnr);
    setPnrBusy(pnr, true);
    const out = await fetchPnr(pnr, { fresh: true });
    if (!out.outcome.ok) {
      setPnrBusy(pnr, false);
      setAnnouncement(m.announce.failed(shown, out.outcome.message));
      return;
    }
    const result = out.outcome.result;
    const point: HistoryPoint = { at: result.checkedAt, status: result.lead.status, position: result.lead.position };
    const source = messages.result.sources[result.snapshot.source];
    const current = statusLabel(point.status, point.position);
    const changed = previous !== null && (previous.status !== point.status || previous.position !== point.position);
    const text = changed ? m.announce.changed(shown, statusLabel(previous.status, previous.position), current, source) : m.announce.same(shown, current, source);
    if (signedIn && before) {
      const saved = await saveWatchlist({ pnr, label: before.label, checks: [...before.checks, point].slice(-40) });
      setPnrBusy(pnr, false);
      if (!saved.ok) {
        setAnnouncement(m.announce.notSaved(shown));
        return;
      }
      setServer((list) => list.map((e) => (e.pnr === pnr ? saved.data : e)));
    } else {
      if (!signedIn) watchlistStore.appendCheck(pnr, point);
      setPnrBusy(pnr, false);
    }
    setAnnouncement(text);
  };

  const remove = async (pnr: string) => {
    const index = entries.findIndex((e) => e.pnr === pnr);
    const gone = entries[index];
    if (!gone) return;
    const shown = formatPnr(pnr);
    if (signedIn) {
      setServer((list) => list.filter((e) => e.pnr !== pnr));
      const out = await deleteWatchlist(pnr);
      if (!out.ok) {
        setServer((list) => restoreAt(list, index, gone));
        setAnnouncement(m.announce.removeFailed(shown));
        return;
      }
    } else {
      local.remove(pnr);
    }
    setRemoved(gone);
    setAnnouncement(m.announce.removed(shown));
  };

  const undo = async () => {
    const entry = removed;
    if (!entry) return;
    setRemoved(null);
    if (signedIn) {
      const back = await saveWatchlist({ pnr: entry.pnr, label: entry.label, checks: entry.checks });
      if (!back.ok) {
        setRemoved(entry);
        setAnnouncement(m.announce.restoreFailed);
        return;
      }
      setServer((list) => [back.data, ...list.filter((e) => e.pnr !== entry.pnr)]);
    } else {
      restoreLocal(entry);
    }
    setAnnouncement(m.announce.restored);
  };

  const clearAll = () => {
    local.clear();
    setRemoved(null);
    setAnnouncement(m.announce.cleared);
  };

  const move = async () => {
    if (!mergePlan) return;
    const payload = [...mergePlan.create, ...mergePlan.update].map((e) => ({ pnr: e.pnr, label: e.label, checks: e.checks }));
    const out = await mergeWatchlist(payload);
    if (!out.ok) {
      setAnnouncement(m.merge.failed);
      return;
    }
    setServer(out.data);
    local.clear();
    setMergeDismissed(true);
    setAnnouncement(m.merge.moved(payload.length));
  };

  const undoButton = removed ? <UndoButton onUndo={() => void undo()} /> : null;
  const showClear = !signedIn && entries.length > 0;

  return (
    <section className="page-frame page-body">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[56ch]">
          <h1 className="optical-hang text-page tracking-display">{m.title}</h1>
          <p className="mt-3.5 text-base text-ink-1/78">{signedIn ? m.signedLead : m.anonLead}</p>
          {ready ? <p className="mt-3 font-display text-label font-semibold uppercase leading-normal tracking-caps text-ink-1/70">{m.count(entries.length)}</p> : <CountSkeleton />}
        </div>
        {signedIn ? null : (
          <Link href="/login" className={buttonClassName({ variant: "secondary", className: BUTTON_LEADING })}>
            {m.syncAction}
          </Link>
        )}
      </div>

      <p aria-live="polite" className="mt-4 min-h-5 text-sm text-accent-text">
        {announcement}
      </p>

      {loadError ? (
        <ErrorState className="mt-4" title={m.loadError} onRetry={() => router.refresh()} />
      ) : !ready ? (
        <SavedPlateSkeleton />
      ) : entries.length > 0 ? (
        <>
          <SavedPlate
            title={signedIn ? m.plate.account : m.plate.device}
            sampleData={sampleData}
            entries={entries}
            busy={busy}
            onRecheck={(pnr) => void recheck(pnr)}
            onRemove={(pnr) => void remove(pnr)}
          />
          {showClear || undoButton ? (
            <div className="mt-4 flex gap-3">
              {showClear ? (
                <Button variant="ghost" className={BUTTON_LEADING} onClick={clearAll}>
                  {m.clearLocal}
                </Button>
              ) : null}
              {undoButton}
            </div>
          ) : null}
        </>
      ) : (
        <EmptyPlate undo={undoButton} />
      )}

      <SyncNote signedIn={signedIn} />

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
