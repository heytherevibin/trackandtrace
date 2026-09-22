"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Led } from "@/components/ui/led";
import type { TapRequest } from "@/console/keys/tap";
import { runTap } from "@/console/keys/tap-client";
import { TAP_REASON_MAX, tapReason } from "@/console/keys/tap-schema";
import { consoleMessages } from "@/console/messages";

// Form TC-01 (docs/design/sheets/console/Main.dc.html): the dialog every risky action opens
// (spec §D). It runs one tap through runTap -- never a second WebAuthn implementation of its own
// -- and calls onConfirmed() only once /api/tap/verify has answered `{ ok: true }`. The action
// itself is never performed here: the tap stays unspent (tap.ts's own note), and the caller
// performs the actual mutation only after onConfirmed fires.
//
// Two roles, and neither is computed from the other. `action`/`target`/`value`/`reason`
// (TapRequest) are what console.action_digest binds a tap to, and what console.use_tap later
// re-digests when the action itself runs -- they are never rendered. `summary`/`change` are what
// the sheet actually draws (Main.dc.html:216-217, composed at :356): a full sentence ("Pause PNR
// checks on production", "Remove YubiKey 5 NFC") and a label/before/after triple ("PNR checks:
// On → Paused", "Keys: 3 → 2") that the caller writes in its own words -- sometimes from data the
// digest fields don't even carry, like a key count from before the removal. Deriving one pair
// from the other would mean the words on screen could only ever change by changing what the tap
// is bound to, which the digest fields were never meant to carry.

const m = consoleMessages.tap;

type Stage = { readonly kind: "idle" } | { readonly kind: "waiting" } | { readonly kind: "failed"; readonly message: string };

// A refused verify shows the message the server sent, as it sent it. An earlier draft matched that
// string against the two refusals TC-01's sheet names and swapped in this file's own wording, so
// the copy could diverge later -- but deciding what a message *means* by comparing its text is a
// thing that breaks silently the first time either string is edited, which is the very moment it
// was supposed to help. If TC-01's wording ever needs to differ, the server picks the message and
// is where that belongs.

export interface ConfirmItsYouProps extends TapRequest {
  readonly open: boolean;
  /**
   * The sheet's {{actionSummary}} -- the bold line. The caller composes it, because the drawn copy
   * is a sentence ("Pause PNR checks on production", "Remove YubiKey 5 NFC") and not one of the
   * four fields above: those are what the database digests and re-digests, and they are never
   * rendered.
   */
  readonly summary: string;
  /**
   * The sheet's Change line, drawn as `${label}: ${before} → ${after}` (e.g. "Keys: 3 → 2"), with
   * the "Change" legend beside it.
   *
   * Optional for the same reason `hint` is, and found the same way one task later: ConsoleTeam's
   * dlg_reset (:288-300) and dlg_remove (:313-325) are TC-01 too, and neither draws a Change row at
   * all -- a reset and a removal have no before-and-after pair to show, only the bold line and the
   * consequence beneath it (task-6-addendum.md §1). The legend goes with it when it is absent: a
   * label with nothing after it says less than no row.
   */
  readonly change?: { readonly label: string; readonly before: string; readonly after: string };
  /**
   * The one consequence of going through with it, in the sheet's own `hint` class, under the
   * Change line and in the same column ("Kiran is signed out everywhere at once and signs in again
   * with the new role.", ConsoleTeam.dc.html:267; :291 and :316 draw one for Task 6's two actions).
   *
   * Optional because TC-01 as drawn in Main.dc.html:213-231 genuinely has none -- it carries a
   * bespoke "Message to travellers" field in that space instead -- and the invite (Task 4) has none
   * either. A per-action line the shared component had no slot for is the sort of thing that gets
   * dropped, or gets TC-01 forked into a second implementation; it is neither (task-5-addendum.md
   * §1). For the role change it is the only place the console says that changing a role signs the
   * member out everywhere.
   */
  readonly hint?: string;
  readonly onReasonChange: (reason: string) => void;
  readonly onCancel: () => void;
  readonly onConfirmed: () => void;
}

/** Form TC-01: confirms it's the member, with a typed reason and one tap, before a risky action runs. */
export function ConfirmItsYou({ open, action, target, value, reason, summary, change, hint, onReasonChange, onCancel, onConfirmed }: ConfirmItsYouProps) {
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
  // Each confirm attempt takes a token. Closing the dialog -- Cancel, Escape, the close button, all
  // of which come through onOpenChange -- bumps it, so an attempt still in flight is abandoned
  // rather than allowed to land. Without this, a member who cancels during the verify round trip
  // still has the action run, which is the one thing a confirmation gate must never do (closing a
  // dialog does not unmount it, so mountedRef alone never caught this). Cancel stays enabled while
  // waiting, as the sheet draws it, so this is the only place to hold that line.
  const attemptRef = useRef(0);

  // Strict Mode's development-only double-invoke (mount, simulate an unmount, mount again -- the
  // same fiber and the same refs throughout, unlike a genuine remount) runs this cleanup once
  // before any real caller ever gets a chance to. `useRef(true)`'s own initial value is never
  // revisited on that second, simulated mount, so without this line `mountedRef.current` reads
  // false forever after -- not just under Strict Mode's own synthetic cycle, but for the rest of
  // this instance's real life, silently discarding every tap that resolves after it, however long
  // that takes. Setting it back to true here, in the effect body a real mount always runs, is what
  // makes the ref track this component's actual mounted state rather than merely "has an unmount
  // simulation run since the ref was created."
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    // tapReason only gates the button here -- it does not trim, reshape or otherwise decide what
    // gets sent. `reason` reaches runTap exactly as typed; only the server's own tapReason import
    // (in route.ts) ever decides, and digests, the trimmed string.
    if (!tapReason.safeParse(reason).success) {
      setRejectedReason(reason);
      return;
    }
    const attempt = ++attemptRef.current;
    setStage({ kind: "waiting" });
    const outcome = await runTap({ action, target, value, reason });
    if (!mountedRef.current || attempt !== attemptRef.current) return;
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
        if (!next) {
          // Bumped before onCancel, so a confirm() already in flight -- awaiting runTap -- finds
          // its token stale when it resumes and abandons the attempt instead of calling onConfirmed.
          attemptRef.current += 1;
          setStage({ kind: "idle" });
          onCancel();
        }
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
            <span className="text-lg font-medium text-ink-1">{summary}</span>
            {change ? (
              <span className="flex items-baseline gap-2.5">
                <span className="legend">{m.changeLabel}</span>
                <span className="text-sm text-ink-1">{`${change.label}: ${change.before} → ${change.after}`}</span>
              </span>
            ) : null}
            {hint ? <p className="text-label text-ink-3">{hint}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm-reason" className="legend-md text-accent-text">
              {m.reasonLabel}
            </label>
            <textarea
              id="confirm-reason"
              rows={3}
              className="well w-full resize-none"
              placeholder={m.reasonPlaceholder}
              // Stops where tapReason stops. The alert below renders `reasonShort` for every
              // schema failure, so an over-long reason used to be told to write more; capping the
              // field makes that case unreachable by typing, the same fix both key-name fields
              // already carry.
              maxLength={TAP_REASON_MAX}
              value={reason}
              onChange={(event) => onReasonChange(event.currentTarget.value)}
              // Locked once the ceremony starts: the tap is minted over this exact string, and the
              // action that spends it re-digests what the caller then sends. Editing in between
              // would spend against a reason the tap was never taken for, and the member would get
              // "no tap for this action" for something they did to themselves.
              disabled={waiting}
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
