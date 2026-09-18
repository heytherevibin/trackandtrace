"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/session/session-provider";
import { PageHeader } from "@/components/ui/page-header";
import { notify } from "@/components/ui/toast";
import { messages } from "@/messages";
import { fetchPnr } from "@/services/pnr-source";
import { recentStore } from "@/services/stores/recent-store";
import { buildShareText, buildShareUrl, shareOrCopy } from "@/services/stores/share";
import { useWatchlist } from "@/services/stores/watchlist-store";
import { deleteWatchlist, listWatchlist, saveWatchlist } from "@/services/watchlist-api";
import type { HistoryPoint, PnrResult } from "@/types/domain";
import { formatPnr } from "@/utils/pnr";
import { formatTime } from "@/utils/datetime";
import { statusLabel } from "@/utils/status-tone";
import { JourneyDetails } from "./journey-details";
import { PassengerTable } from "./passenger-table";
import { ProvenancePanel } from "./provenance-panel";
import { ResultActions } from "./result-actions";
import { StatusBand } from "./status-band";

export interface PnrResultInitial {
  readonly result: PnrResult;
  readonly cached: boolean;
  readonly latencyMs: number;
}

function labelFor(result: PnrResult): string {
  const t = result.snapshot.train;
  return `${t.number} · ${t.from.code}→${t.to.code} · ${result.snapshot.journeyDateLabel}`;
}

function pointFor(result: PnrResult): HistoryPoint {
  return { at: result.checkedAt, status: result.lead.status, position: result.lead.position };
}

/** The result sheet. Server-rendered from the loader; refresh, share, and save happen here. */
export function PnrResultView({ pnr, initial }: { readonly pnr: string; readonly initial: PnrResultInitial }) {
  const m = messages.result;
  const user = useUser();
  const { entries, available, upsert, remove } = useWatchlist();
  const [state, setState] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverSaved, setServerSaved] = useState<boolean | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const { result, cached, latencyMs } = state;
  const saved = user ? serverSaved === true : entries.some((e) => e.pnr === pnr);

  useEffect(() => {
    recentStore.push({ pnr, label: labelFor(result), status: result.lead.status, position: result.lead.position, checkedAt: result.checkedAt });
  }, [pnr, result]);

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

  const refresh = async () => {
    setRefreshing(true);
    const out = await fetchPnr(pnr, { fresh: true });
    setRefreshing(false);
    if (!out.outcome.ok) {
      notify.error(m.refreshFailed, out.outcome.message);
      return;
    }
    const next = out.outcome.result;
    setState({ result: next, cached: out.cached, latencyMs: out.latencyMs });
    setAnnouncement(m.updated(statusLabel(next.lead.status, next.lead.position), formatTime(next.checkedAt)));
    if (!user && entries.some((e) => e.pnr === pnr)) upsert(pnr, labelFor(next), pointFor(next));
  };

  const share = async () => {
    const outcome = await shareOrCopy({ title: messages.common.productName, text: buildShareText(result), url: buildShareUrl(window.location.origin, pnr) }, navigator);
    if (outcome === "copied") notify.success(m.actions.copied, m.actions.shareHint);
    else if (outcome === "failed") notify.error(m.actions.shareFailed);
  };

  const toggleSave = async () => {
    if (user) {
      setSaving(true);
      const out = saved ? await deleteWatchlist(pnr) : await saveWatchlist({ pnr, label: labelFor(result), checks: [pointFor(result)] });
      setSaving(false);
      if (!out.ok) {
        notify.error(m.actions.saveFailed, out.error.message);
        return;
      }
      setServerSaved(!saved);
      notify.success(saved ? m.actions.removed : m.actions.savedToAccount);
      return;
    }
    if (!available) {
      notify.error(m.actions.storageUnavailable);
      return;
    }
    if (saved) {
      remove(pnr);
      notify.success(m.actions.removed);
    } else {
      upsert(pnr, labelFor(result), pointFor(result));
      notify.success(m.actions.savedOnDevice);
    }
  };

  const s = result.snapshot;
  return (
    <article className="flex flex-col" data-testid="pnr-result">
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      <PageHeader
        back={{ href: "/#terminal", label: m.back }}
        title={m.title(s.train.from.code, s.train.to.code)}
        lead={m.lead(m.trainLine(s.train.number, s.train.name), s.journeyDateLabel, s.cls)}
        meta={<span className="tnum">{m.pnr(formatPnr(pnr))}</span>}
        actions={<ResultActions refreshing={refreshing} onRefresh={() => void refresh()} onShare={() => void share()} saved={saved} saving={saving} onToggleSave={() => void toggleSave()} />}
      />
      <StatusBand className="mt-8" result={result} cached={cached} />
      <div className="mt-[28px] grid items-start gap-[28px] lg:grid-cols-[1.25fr_.75fr]">
        <PassengerTable pax={s.pax} />
        <JourneyDetails snapshot={s} quota={result.lead.quota} />
      </div>
      <ProvenancePanel className="mt-[28px]" pnr={pnr} source={s.source} checkedAt={result.checkedAt} latencyMs={latencyMs} />
    </article>
  );
}
