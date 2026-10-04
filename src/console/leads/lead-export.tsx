"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Led } from "@/components/ui/led";
import { SweepBar } from "@/components/ui/sweep-bar";
import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { LEAD_EXPORT_ACTION, LEAD_EXPORT_MAX, LEAD_EXPORT_TARGET, leadExportFilters } from "@/console/leads/export";
import type { LeadFilters } from "@/console/leads/filters";
import { requestExport, type PreparedLeadExport } from "@/console/leads/leads-client";
import { consoleMessages } from "@/console/messages";
import { formatCount } from "@/utils/datetime";

const m = consoleMessages.leads.export;

// Export CSV (ConsoleLeads.dc.html: Export: confirm, preparing, ready). The same flow as the audit
// log's export, and the same reasons (src/console/audit/export-dialog.tsx, which says them at
// length); it is restated here rather than shared because the two differ in everything they are
// bound to — a range and sixteen columns there, five filters and whole addresses here — and agree
// only in their four stages.
//
// THE FILE IS HELD BY THIS PAGE AND NOWHERE ELSE. The route answers it once, uncached; it sits in
// this component's state until it is downloaded or ten minutes pass, whichever is first, and is
// then dropped. That is what "works once, in this browser, for 10 minutes" means: there is no link
// to share and nothing on the server to fetch again.

const EXPORT_TTL_MS = 10 * 60_000;
const REVOKE_AFTER_MS = 1_000;

interface Ask {
  /** The canonical filters the tap is minted over and the database re-digests. Built once, at the press. */
  readonly filters: string;
  readonly count: number;
}

type Stage =
  | { readonly kind: "idle" }
  | { readonly kind: "confirm"; readonly ask: Ask }
  | { readonly kind: "preparing"; readonly ask: Ask }
  | { readonly kind: "ready"; readonly file: PreparedLeadExport; readonly expiresAt: number }
  | { readonly kind: "failed"; readonly message: string };

interface ExportContext {
  readonly stage: Stage;
  readonly start: () => void;
  readonly download: () => void;
}

const Context = createContext<ExportContext | null>(null);

function useExport(): ExportContext {
  const value = useContext(Context);
  if (!value) throw new Error("LeadExportButton and LeadExportStatus must sit inside LeadExportProvider");
  return value;
}

/**
 * Holds one export from the press to the download. The button is drawn in the page header and the
 * status rows between the filters and the list, so the two are joined here rather than by either.
 *
 * `total` is how many leads the filters in force match, or `null` when the list could not be read:
 * then there is nothing to count, and nothing is asked of a key.
 */
export function LeadExportProvider({ filters, environment, total, children }: { readonly filters: LeadFilters; readonly environment: string; readonly total: number | null; readonly children: ReactNode }) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [reason, setReason] = useState("");
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A file is the list as it was filtered when it was asked for. Once the filters move on, a ready
  // file or a refusal describes a list that is no longer on screen, so it is dropped.
  const key = `${filters.news}|${filters.account}|${filters.source}|${filters.tag}|${filters.seen}`;
  const [keySeen, setKeySeen] = useState(key);
  if (key !== keySeen) {
    setKeySeen(key);
    if (stage.kind === "ready" || stage.kind === "failed") setStage({ kind: "idle" });
  }

  const start = useCallback(() => {
    setReason("");
    if (total === null) {
      setStage({ kind: "failed", message: m.unavailable });
      return;
    }
    // Before a key is asked for: the database refuses the same thing, after one.
    if (total > LEAD_EXPORT_MAX) {
      setStage({ kind: "failed", message: m.tooMany(LEAD_EXPORT_MAX) });
      return;
    }
    setStage({ kind: "confirm", ask: { filters: leadExportFilters(filters, environment, new Date()), count: total } });
  }, [filters, environment, total]);

  const confirmed = useCallback(() => {
    if (stage.kind !== "confirm" || inFlight.current) return;
    inFlight.current = true;
    const ask = stage.ask;
    const typed = reason;
    setStage({ kind: "preparing", ask });
    void (async () => {
      const outcome = await requestExport(ask.filters, typed);
      inFlight.current = false;
      if (!mounted.current) return;
      // The ten minutes start when the file exists, not when the button was pressed.
      setStage(outcome.kind === "done" ? { kind: "ready", file: outcome.file, expiresAt: Date.now() + EXPORT_TTL_MS } : { kind: "failed", message: outcome.message });
    })();
  }, [stage, reason]);

  const download = useCallback(() => {
    if (stage.kind !== "ready") return;
    if (Date.now() >= stage.expiresAt) {
      setStage({ kind: "idle" });
      return;
    }
    const url = URL.createObjectURL(new Blob([stage.file.csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = stage.file.fileName;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
    // Once: the file leaves this page's memory as it is handed over.
    setStage({ kind: "idle" });
  }, [stage]);

  useEffect(() => {
    if (stage.kind !== "ready") return;
    const timer = setTimeout(() => setStage({ kind: "idle" }), Math.max(stage.expiresAt - Date.now(), 0));
    return () => clearTimeout(timer);
  }, [stage]);

  const value = useMemo<ExportContext>(() => ({ stage, start, download }), [stage, start, download]);

  return (
    <Context.Provider value={value}>
      {children}
      {stage.kind === "confirm" ? (
        <ConfirmItsYou
          open
          action={LEAD_EXPORT_ACTION}
          target={LEAD_EXPORT_TARGET}
          value={stage.ask.filters}
          reason={reason}
          summary={m.summary(formatCount(stage.ask.count))}
          hint={m.hint}
          onReasonChange={setReason}
          onCancel={() => setStage({ kind: "idle" })}
          onConfirmed={confirmed}
        />
      ) : null}
    </Context.Provider>
  );
}

/** The page header's Export CSV. Drawn for Owner and Admin; Support's page has none. */
export function LeadExportButton() {
  const { start } = useExport();
  return (
    <Button
      variant="secondary"
      onClick={start}
      leadingIcon={
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" />
        </svg>
      }
    >
      {m.action}
    </Button>
  );
}

/** The rows between the filters and the list: preparing, ready, or why not. Nothing when idle. */
export function LeadExportStatus() {
  const { stage, download } = useExport();
  if (stage.kind === "preparing") {
    return (
      <div role="status" className="border-line border">
        <SweepBar />
        <div className="flex items-center gap-3 px-4 py-3">
          <Led busy />
          <span className="text-sm leading-5">{m.preparing(formatCount(stage.ask.count))}</span>
        </div>
      </div>
    );
  }
  if (stage.kind === "ready") {
    return (
      <div role="status" className="border-line flex flex-wrap items-center gap-3.5 border px-4 py-2.5">
        <Led lit />
        <span className="tnum text-body tracking-head">{stage.file.fileName}</span>
        <span className="legend">{m.works}</span>
        <div className="grow" />
        <Button variant="primary" onClick={download}>
          {m.download}
        </Button>
      </div>
    );
  }
  if (stage.kind === "failed") {
    return (
      <div role="alert" className="border-line flex items-center gap-3 border px-4 py-3">
        <Led />
        <span className="text-sm leading-5">{stage.message}</span>
      </div>
    );
  }
  return null;
}
