"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/session/session-provider";
import { PageHeader } from "@/components/ui/page-header";
import { notify } from "@/components/ui/toast";
import { messages } from "@/messages";
import { fetchPnr } from "@/services/pnr-source";
import { recentStore } from "@/services/stores/recent-store";
import { useWatchlist } from "@/services/stores/watchlist-store";
import type { PnrResult } from "@/types/domain";
import { formatPnr } from "@/utils/pnr";
import { formatTime } from "@/utils/datetime";
import { statusLabel } from "@/utils/status-tone";
import { JourneyDetails } from "./journey-details";
import { PassengerTable } from "./passenger-table";
import { ProvenancePanel } from "./provenance-panel";
import { ResultActions } from "./result-actions";
import { StatusBand } from "./status-band";
import { pointFor, useSaveAndShare, watchLabelFor } from "./use-save-share";

export interface PnrResultInitial {
  readonly result: PnrResult;
  readonly cached: boolean;
  readonly latencyMs: number;
}

/** The result sheet. Server-rendered from the loader; refresh, share, and save happen here. */
export function PnrResultView({ pnr, initial }: { readonly pnr: string; readonly initial: PnrResultInitial }) {
  const m = messages.result;
  const user = useUser();
  const { entries, upsert } = useWatchlist();
  const [state, setState] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const { result, cached, latencyMs } = state;
  const { saved, saving, share, toggleSave } = useSaveAndShare(pnr, result);

  useEffect(() => {
    recentStore.push({ pnr, label: watchLabelFor(result), status: result.lead.status, position: result.lead.position, checkedAt: result.checkedAt });
  }, [pnr, result]);

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
    if (!user && entries.some((e) => e.pnr === pnr)) upsert(pnr, watchLabelFor(next), pointFor(next));
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
        actions={<ResultActions refreshing={refreshing} onRefresh={() => void refresh()} onShare={share} saved={saved} saving={saving} onToggleSave={toggleSave} />}
      />
      <StatusBand className="mt-8" result={result} cached={cached} />
      <div className="mt-[28px] grid grid-cols-[minmax(0,1fr)] items-start gap-[28px] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,.75fr)]">
        <PassengerTable pax={s.pax} />
        <JourneyDetails snapshot={s} quota={result.lead.quota} />
      </div>
      <ProvenancePanel className="mt-[28px]" pnr={pnr} source={s.source} checkedAt={result.checkedAt} latencyMs={latencyMs} />
    </article>
  );
}
