"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Led } from "@/components/ui/led";
import type { TapRequest } from "@/console/keys/tap";
import { runTap } from "@/console/keys/tap-client";
import { consoleMessages } from "@/console/messages";

// Form TC-01 (docs/design/sheets/console/Main.dc.html): the dialog every risky action opens
// (spec §D). It runs one tap through runTap -- never a second WebAuthn implementation of its own
// -- and calls onConfirmed() only once /api/tap/verify has answered `{ ok: true }`. The action
// itself is never performed here: the tap stays unspent (tap.ts's own note), and the caller
// performs the actual mutation only after onConfirmed fires.
//
// The sheet's own composition for the two summary lines (actionSummary: 'Pause PNR checks on
// production'; fig: 'PNR checks: On → Paused', built from a target of 'PNR checks' and a value of
// 'On → Paused') is what this component transcribes: the bold line is `action`, verbatim, and the
// Change line is `${target}: ${value}`, verbatim. Nothing here composes a sentence of its own from
// the four fields -- a caller that wants different words passes different strings.

const m = consoleMessages.tap;

type Stage = { readonly kind: "idle" } | { readonly kind: "waiting" } | { readonly kind: "failed"; readonly message: string };

// Mirrors tap.ts's own tapReason (trim, then 10-200 characters) rather than importing it: that
// module's other top-level exports reach next/headers through @/console/auth/db, which a "use
// client" bundle must never carry. This check only ever gates the button -- it does not trim,
// reshape or otherwise decide what runTap sends, so it can never cause the drift ruling 3 (task-3
// addendum) warns about: `reason` reaches runTap exactly as typed, and the server's own tapReason
// import is what actually decides, and digests, the trimmed string.
function reasonIsLongEnough(reason: string): boolean {
  const length = reason.trim().length;
  return length >= 10 && length <= 200;
}

export interface ConfirmItsYouProps extends TapRequest {
  readonly open: boolean;
  readonly onReasonChange: (reason: string) => void;
  readonly onCancel: () => void;
  readonly onConfirmed: () => void;
}

/** Form TC-01: confirms it's the member, with a typed reason and one tap, before a risky action runs. */
export function ConfirmItsYou({ open, action, target, value, reason, onReasonChange, onCancel, onConfirmed }: ConfirmItsYouProps) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  // The reason a confirm attempt refused, or null once none has (or the member has since edited
  // it away). reasonAlert below is derived from comparing this to the live `reason` prop rather
  // than tracked as its own state, so an edit clears the alert for free -- no effect needed to
  // notice the prop changed underneath it.
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);
  const tapButtonRef = useRef<HTMLButtonElement>(null);
  // What the previous render's stage was, so the button is refocused only on a genuine
  // "waiting" -> not-waiting return (a dismissed or failed tap), never on first render.
  const previousStageKindRef = useRef<Stage["kind"]>(stage.kind);
  // A tap started before this component goes away must never resolve into a gone instance's state.
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // Adjusting state when a prop changes, during render rather than in an effect -- react.dev's own
  // recommended shape for this, since an effect-based reset would commit one extra stale frame
  // first. The sheet's own dialog always starts on "Idle", and the same mounted instance may be
  // reused for a different action the next time it opens.
  const [openSeen, setOpenSeen] = useState(open);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) {
      setStage({ kind: "idle" });
      setRejectedReason(null);
    }
  }

  useEffect(() => {
    const previous = previousStageKindRef.current;
    previousStageKindRef.current = stage.kind;
    if (previous === "waiting" && stage.kind !== "waiting") tapButtonRef.current?.focus();
  }, [stage]);

  async function confirm(): Promise<void> {
    if (!reasonIsLongEnough(reason)) {
      setRejectedReason(reason);
      return;
    }
    setStage({ kind: "waiting" });
    const outcome = await runTap({ action, target, value, reason });
    if (!mountedRef.current) return;
    if (outcome.kind === "done") {
      onConfirmed();
      return;
    }
    setStage(outcome.kind === "cancelled" ? { kind: "idle" } : { kind: "failed", message: outcome.message });
  }

  const waiting = stage.kind === "waiting";
  const reasonAlert = rejectedReason !== null && rejectedReason === reason;
  const statusMessage = stage.kind === "waiting" ? m.status : stage.kind === "failed" ? stage.message : null;

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        title={m.title}
        description={m.form}
        footer={
          <>
            <DialogClose render={<Button variant="secondary">{m.cancel}</Button>} />
            <Button ref={tapButtonRef} variant="primary" disabled={waiting} onClick={() => void confirm()}>
              {waiting ? m.waiting : m.tap}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-lg font-medium text-ink-1">{action}</span>
            <span className="flex items-baseline gap-2.5">
              <span className="legend">{m.changeLabel}</span>
              <span className="text-sm text-ink-1">{`${target}: ${value}`}</span>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm-reason" className="legend-md text-accent-text">
              {m.reasonLabel}
            </label>
            <textarea
              id="confirm-reason"
              rows={3}
              className="well w-full resize-none"
              value={reason}
              onChange={(event) => onReasonChange(event.currentTarget.value)}
              aria-invalid={reasonAlert || undefined}
              aria-describedby={reasonAlert ? "confirm-reason-alert" : undefined}
            />
            <p className="text-label text-ink-3">{m.reasonHint}</p>
            {reasonAlert ? (
              <p id="confirm-reason-alert" role="alert" className="text-label font-medium text-ink-alert">
                {m.reasonShort}
              </p>
            ) : null}
          </div>
          {statusMessage ? (
            <div role="status" className="flex items-center gap-2.5 border border-line bg-surface-1 px-3.5 py-3">
              <Led lit={waiting} />
              <span className="text-sm">{statusMessage}</span>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
