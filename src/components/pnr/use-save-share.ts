"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/components/session/session-provider";
import { notify } from "@/components/ui/toast";
import { messages } from "@/messages";
import { buildShareText, buildShareUrl, shareOrCopy } from "@/services/stores/share";
import { useWatchlist, watchlistStore } from "@/services/stores/watchlist-store";
import { deleteWatchlist, listWatchlist, saveWatchlist } from "@/services/watchlist-api";
import type { HistoryPoint, PnrResult } from "@/types/domain";

/** "12627 · SBC→NDLS · Sat, 19 Sept": how a saved PNR is labelled on the watchlist. */
export function watchLabelFor(result: PnrResult): string {
  const t = result.snapshot.train;
  return `${t.number} · ${t.from.code}→${t.to.code} · ${result.snapshot.journeyDateLabel}`;
}

export function pointFor(result: PnrResult): HistoryPoint {
  return { at: result.checkedAt, status: result.lead.status, position: result.lead.position };
}

export interface SaveAndShare {
  readonly saved: boolean;
  readonly saving: boolean;
  /** True for two seconds after a copy, while v4's share key reads "Link copied". */
  readonly copied: boolean;
  readonly signedIn: boolean;
  readonly toggleSave: () => void;
  readonly share: () => void;
}

/**
 * Save to the watchlist (this device's, or the account's when signed in) and share a result's link: one behaviour for
 * the record in place on the check plate and the full record page.
 */
export function useSaveAndShare(pnr: string, result: PnrResult): SaveAndShare {
  const m = messages.result.actions;
  const user = useUser();
  const { entries, available, upsert, remove } = useWatchlist();
  const [saving, setSaving] = useState(false);
  const [serverSaved, setServerSaved] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  const saved = user ? serverSaved === true : entries.some((e) => e.pnr === pnr);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void listWatchlist().then((out) => {
      if (!cancelled) setServerSaved(out.ok ? out.data.some((e) => e.pnr === pnr) : false);
    });
    return () => {
      cancelled = true;
    };
  }, [user, pnr]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const share = async () => {
    const outcome = await shareOrCopy({ title: messages.common.productName, text: buildShareText(result), url: buildShareUrl(window.location.origin, pnr) }, navigator);
    if (outcome === "copied") {
      notify.success(m.copied, m.shareHint);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2_000);
    } else if (outcome === "failed") notify.error(m.shareFailed);
  };

  const toggleSave = async () => {
    if (user) {
      setSaving(true);
      const out = saved ? await deleteWatchlist(pnr) : await saveWatchlist({ pnr, label: watchLabelFor(result), checks: [pointFor(result)] });
      setSaving(false);
      if (!out.ok) {
        notify.error(m.saveFailed, out.error.message);
        return;
      }
      setServerSaved(!saved);
      notify.success(saved ? m.removed : m.savedToAccount);
      return;
    }
    if (!available) {
      notify.error(m.storageUnavailable);
      return;
    }
    if (saved) {
      const gone = entries.find((e) => e.pnr === pnr);
      remove(pnr);
      // v4: a removal can be undone for five seconds.
      notify.undoable(m.removed, () => {
        if (!gone) return;
        // Put the whole entry back, its history with it, as the watchlist's own undo does.
        const [first, ...rest] = gone.checks;
        watchlistStore.upsert(gone.pnr, gone.label, first);
        for (const point of rest) watchlistStore.appendCheck(gone.pnr, point);
      });
    } else {
      upsert(pnr, watchLabelFor(result), pointFor(result));
      notify.success(m.savedOnDevice);
    }
  };

  return { saved, saving, copied, signedIn: !!user, toggleSave: () => void toggleSave(), share: () => void share() };
}
