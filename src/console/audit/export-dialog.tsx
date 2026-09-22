"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Led } from "@/components/ui/led";
import { SweepBar } from "@/components/ui/sweep-bar";
import { consoleApiMessage } from "@/console/api-message";
import { prepareAuditExport, type PreparedAuditExport } from "@/console/audit/audit-client";
import { AUDIT_EXPORT_ACTION, AUDIT_EXPORT_MAX, auditExportFilters, auditExportRange, type AuditFilters } from "@/console/audit/filters";
import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.audit;

// Export (AuditLog.dc.html): the `Export CSV` control in the page header (:90-96), Form TC-01 as
// the confirm step (:232-251), and the two status rows the sheet draws on the board between the
// chip row and the Entries plate (:136-147).
//
// WHERE THE PREPARED EXPORT LIVES, and why it cannot be replayed by anyone else.
//
// In this component, as a Blob, and nowhere else. The POST that spends the tap answers with the
// CSV itself; nothing is written to Redis, to Postgres or to disk, and there is no second endpoint
// to fetch it from. The sheet's line -- "Works once, in this browser, for 10 minutes" -- is then
// true of the artefact rather than of a bookkeeping rule laid over it:
//
//   in this browser  the bytes exist only in the document that spent the tap. No other tab, device
//                    or person has anything to reach, because nothing was left anywhere to reach.
//   works once       the file is handed over and let go in the same press.
//   for 10 minutes   an untouched one is let go when the timer below fires.
//
// The alternative -- prepare server-side, hand back a token, download over GET -- would mean the
// console's whole filtered audit trail sitting in a shared store for ten minutes, a URL carrying a
// credential to it, and a single-use check with a read-then-delete race in the middle. That is the
// hazard the plan names ("a link that leaks is a copy of the console's whole audit trail"), and the
// way to not get it wrong is to not have it.
//
// The object URL is minted at the moment of the press and revoked immediately after, so not even a
// blob: URL outlives the download. A blob: URL is origin- and document-bound in any case: pasting
// one into another browser fetches nothing.

/** Ten minutes, as the sheet says (:145). */
const EXPORT_TTL_MS = 10 * 60_000;

/**
 * Revoking an object URL in the same tick as the click can cancel the download in some browsers,
 * so the release is scheduled rather than immediate. It is still this press that releases it.
 */
const REVOKE_AFTER_MS = 1_000;

/** Whether a prepared export is still inside the ten minutes the sheet promises. */
function live(expiresAt: number): boolean {
  return Date.now() < expiresAt;
}

type Stage =
  | { readonly kind: "idle" }
  | { readonly kind: "confirm"; readonly ask: Ask }
  | { readonly kind: "preparing"; readonly ask: Ask }
  | { readonly kind: "ready"; readonly file: PreparedAuditExport; readonly expiresAt: number }
  | { readonly kind: "failed"; readonly message: string };

/**
 * One export, frozen at the moment the member pressed Export.
 *
 * The range is computed from `new Date()` once, here, and then carried: the tap is digested over
 * these exact strings and the POST sends these exact strings, so a Today range cannot mean one day
 * at the mint and the next at the spend. `count` and `range` are the words the two status rows and
 * the summary are composed from, which is why they travel with the strings rather than being
 * re-derived from props that may have moved on.
 */
interface Ask {
  readonly range: string;
  readonly filters: string;
  readonly reason: string;
  readonly count: number;
  readonly rangeWord: string;
}

/** Only what the two consumers below actually read: the rest of the export is the provider's own. */
interface ExportContext {
  readonly stage: Stage;
  readonly start: () => void;
  readonly download: () => void;
}

const Context = createContext<ExportContext | null>(null);

function useExport(): ExportContext {
  const value = useContext(Context);
  if (!value) throw new Error("AuditExportButton and AuditExportStatus must sit inside AuditExportProvider");
  return value;
}

/**
 * Holds the export for the whole page, so the control in the page header and the status rows above
 * the Entries plate -- which the sheet draws far apart -- share one state without either of them
 * owning it.
 *
 * `filters` and `total` are the live ones the plate is showing: an export is of what is on screen,
 * so it reads them at the moment of the press and not before.
 *
 * There is deliberately no `environment` prop. Which deployment the audit row is written against is
 * the route's to decide and never a caller's, and the environment a member *filtered* by is already
 * inside `filters`.
 */
export function AuditExportProvider({
  filters,
  total,
  children,
}: {
  readonly filters: AuditFilters;
  readonly total: number;
  readonly children: ReactNode;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [reason, setReason] = useState("");
  // A press that resolves after the component is gone must not set state on it, and a member who
  // navigates away mid-export must not have a file appear behind them.
  const mounted = useRef(true);
  // One export per confirmation. See the note on `confirmed` below for what this closes.
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The filters moving under a prepared export makes it stale: it describes a set the board no
  // longer shows. Pressing Export again is the whole recovery, and it is one press.
  const key = `${filters.range}|${filters.from}|${filters.to}|${auditExportFilters(filters)}`;
  const [keySeen, setKeySeen] = useState(key);
  if (key !== keySeen) {
    setKeySeen(key);
    // Adjusting state during render when a prop changes, rather than in an effect -- react.dev's
    // own shape for this, and it commits no stale frame first. A dialog already open is left alone:
    // it is modal, so the filters cannot have moved because of the member.
    if (stage.kind === "ready" || stage.kind === "failed") setStage({ kind: "idle" });
  }

  const start = useCallback(() => {
    setReason("");
    if (total > AUDIT_EXPORT_MAX) {
      // Refused before the ceremony, not after it: the count is already on screen, and nothing the
      // database is certain to refuse should cost a member a tap. `console.audit_export_max()`
      // refuses it again regardless -- that one is the boundary, this is the courtesy.
      setStage({ kind: "failed", message: m.export.tooMany(AUDIT_EXPORT_MAX) });
      return;
    }
    setStage({
      kind: "confirm",
      ask: {
        range: auditExportRange(filters, new Date()),
        filters: auditExportFilters(filters),
        reason: "",
        count: total,
        rangeWord: m.export.ranges[filters.range],
      },
    });
  }, [filters, total]);

  /**
   * Both of the callbacks below read `stage` and call `setStage` with a plain value, and neither
   * does anything else inside an updater function. That is not style.
   *
   * The first cut put the POST inside `setStage(current => …)`. A state updater must be pure, and
   * React proves it by **calling it twice** in development -- so the export was prepared twice from
   * one press: the first call spent the tap and got the file, the second found the challenge
   * already used and came back "That confirmation no longer matches this export", which is what the
   * member was left looking at. Every unit test passed, because `render()` without StrictMode
   * invokes an updater once. The e2e run in a real `next dev` is what found it, and there is now a
   * StrictMode case in tests/unit/console/audit/export-dialog.test.tsx so jsdom finds it next time.
   *
   * `inFlight` closes the same hole from the other side: two presses of a control that is briefly
   * still on screen must not become two exports, two taps and two audit rows.
   */
  const confirmed = useCallback(() => {
    if (stage.kind !== "confirm" || inFlight.current) return;
    inFlight.current = true;
    // `reason` is this callback's own dependency, so `confirmed` is re-made on every keystroke and
    // the string that goes out is the one the field held when the key answered -- the same one
    // ConfirmItsYou had just minted the tap over.
    const ask: Ask = { ...stage.ask, reason };
    setStage({ kind: "preparing", ask });
    void (async () => {
      const answer = await prepareAuditExport({ range: ask.range, filters: ask.filters, reason: ask.reason });
      inFlight.current = false;
      if (!mounted.current) return;
      setStage(
        answer.ok
          ? // The ten minutes start when the file exists, not when the press happened: the tap and
            // the round trip are the member's time, not the export's.
            { kind: "ready", file: answer.data, expiresAt: Date.now() + EXPORT_TTL_MS }
          : // consoleApiMessage is the one thing that decides what a failed console request says:
            // a real refusal already carries this module's copy, and a fetch that never arrived
            // gets the console's own line instead of a technical one.
            { kind: "failed", message: consoleApiMessage(answer.error) },
      );
    })();
  }, [stage, reason]);

  const download = useCallback(() => {
    if (stage.kind !== "ready") return;
    // The deadline, re-read at the press rather than trusted to the timer below. A setTimeout is
    // not a deadline: a background tab is throttled, and a machine that slept does not run it at
    // all -- so a tab left open overnight would still have handed the file over in the morning,
    // which is not what "for 10 minutes" says. The timer keeps the row honest on screen; this
    // keeps the promise.
    if (!live(stage.expiresAt)) {
      setStage({ kind: "idle" });
      return;
    }
    const url = URL.createObjectURL(new Blob([stage.file.csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = stage.file.fileName;
    // In the document for the press and out of it again: a detached anchor's click is honoured by
    // Chromium but not reliably elsewhere, and this is the shape that works everywhere. It is never
    // rendered, so nothing sees it.
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
    // Handed over and let go in one press. Nothing is kept: a second Download would be a second copy
    // of the log from a confirmation that was already spent.
    setStage({ kind: "idle" });
  }, [stage]);

  // Ten minutes, and the file is gone. The timer is the only thing holding it, so letting it fire
  // is all it takes -- there is nothing on a server to expire.
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
          // The four fields console.action_digest hashes and console.use_tap re-hashes. They are
          // never rendered: the line the sheet draws is `summary`, below, and it is composed from
          // the count and the range rather than from any of these.
          action={AUDIT_EXPORT_ACTION}
          target={stage.ask.range}
          value={stage.ask.filters}
          reason={reason}
          // :237, word for word for the drawn case.
          summary={m.export.summary(stage.ask.count, stage.ask.rangeWord)}
          // No `change`: an export has no before-and-after pair to show. The prop has been optional
          // since the Team phase and this is the shape it was made optional for.
          onReasonChange={setReason}
          onCancel={() => setStage({ kind: "idle" })}
          onConfirmed={confirmed}
        />
      ) : null}
    </Context.Provider>
  );
}

/**
 * `Export CSV` (:90-96), in the page header's actions, behind the sheet's own `canExport`.
 *
 * Rendering it is the caller's decision and there is deliberately no prop for it here: the phone
 * sheet replaces this control with a line of its own ("Open on a larger screen to export.",
 * AuditLogPhone.dc.html:64), which is Task 5's, and a control that is simply not rendered is the
 * cleanest thing for that task to arrange.
 */
export function AuditExportButton() {
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
      {m.export.action}
    </Button>
  );
}

/**
 * The two rows the sheet draws on the board (:136-147), and a third it does not.
 *
 * **Not drawn:** the failure row. The sheet draws the export succeeding and never being refused,
 * and a refusal that showed nothing would leave a member pressing a control that had already
 * stopped working. `role="alert"` rather than `role="status"`, because it interrupts something the
 * member was in the middle of.
 */
export function AuditExportStatus() {
  const { stage, download } = useExport();

  if (stage.kind === "preparing") {
    return (
      <div role="status" className="border border-line">
        <SweepBar />
        <div className="flex items-center gap-3 px-4 py-3">
          <Led busy />
          <span className="text-sm leading-5">{m.export.preparing(stage.ask.count, stage.ask.rangeWord)}</span>
        </div>
      </div>
    );
  }

  if (stage.kind === "ready") {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3.5 border border-line px-4 py-2.5">
        <Led lit />
        {/* The sheet's `fig` cell at 15px / 0.02em (:144), in this codebase's own tokens: `text-body`
            is 15px and `tracking-head` is 0.02em, and `tnum` gives the date in the name even
            columns, the same treatment the table's Address cell gets. */}
        <span className="tnum text-body tracking-head">{stage.file.fileName}</span>
        <span className="legend">{m.export.works}</span>
        <div className="grow" />
        <Button variant="primary" onClick={download}>
          {m.export.download}
        </Button>
      </div>
    );
  }

  if (stage.kind === "failed") {
    return (
      <div role="alert" className="flex items-center gap-3 border border-line px-4 py-3">
        <Led />
        <span className="text-sm leading-5">{stage.message}</span>
      </div>
    );
  }

  return null;
}
