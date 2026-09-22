"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { notify } from "@/components/ui/toast";
import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { consoleMessages } from "@/console/messages";
import type { TeamInvite } from "@/console/team/team";
import { resendInvite, revokeInvite } from "@/console/team/team-client";
import { cn } from "@/utils/cn";

const s = consoleMessages.team.resendInvite;
const v = consoleMessages.team.revokeInvite;

// The literal console.use_tap('Revoked an invite', …) binds
// (supabase/migrations/20260922090000_console_team.sql:376) -- a digest field, never rendered, so it
// lives beside the dialog it feeds rather than in the copy file with the drawn strings.
const REVOKE_ACTION = "Revoked an invite";

/** Which of the two dialogs this row has open, if any. One at a time, so two can never stack. */
type Opened = "none" | "resend" | "revoke";

/**
 * One pending invite's row actions (ConsoleTeam.dc.html:163): two inline `btn btn-ghost btn-sm`
 * buttons, Resend and Revoke, in the Actions cell.
 *
 * Not a row menu. The Members table beside this one puts its three actions behind a trigger
 * (:145, :193-199) and this one draws its two in the open, so `member-row-menu.tsx` is deliberately
 * not reused here -- the same shape `src/console/account/keys-plate.tsx` already draws for its own
 * per-row Rename and Remove, down to `variant="ghost" size="sm"` and no per-row `aria-label`: the
 * sheet gives these buttons plain text and the row they sit in is what tells them apart.
 *
 * The two actions are deliberately asymmetric, because the database is:
 *
 * - **Resend** is a plain `ConfirmDialog` -- the sheet's dlg_resend (:347-357) exactly. It re-sends
 *   a letter to an address an Owner already approved and changes no access, so it takes no tap, and
 *   `console_resend_invite` has no `p_reason` to spend one with. It is offered on an expired invite
 *   too: expiry does not release the address from `console_invites_live_email_idx`, so a resend is
 *   how an Owner recovers one (task-7-addendum.md §1).
 * - **Revoke** goes through TC-01. The sheet draws dlg_revoke (:360-370) as a plain alertdialog like
 *   its sibling, but `console_revoke_invite` calls `console.use_tap('Revoked an invite', …)` and
 *   *requires* a tap and a reason -- and the shipped database is the security boundary
 *   (task-7-addendum.md §3). Both of the sheet's drawn lines survive, as TC-01's `summary` and
 *   `hint`; only the reason field and the tap are added. There is no second confirm step in front of
 *   it, and no Change row inside it -- a revocation has no before-and-after pair to show, the same
 *   shape dlg_reset and dlg_remove take (task-6-addendum.md §1).
 *
 * The refusal alert sits here, in the cell, for the reason `member-row-menu.tsx` spells out: both
 * dialogs have already closed by the time a refusal comes back -- TC-01's `onConfirmed` fires the
 * moment the tap verifies, before the request this component then sends -- so there is no dialog
 * left to show one in. An alert that stays beside the control that would retry it, never a toast,
 * which is a notice that goes away while a refusal is something a member has to act on.
 *
 * The list refreshes with `router.refresh()`: the three plates are server components, so the page
 * re-runs `getTeam()` -- and `console_team` leaves a revoked invite out of the pending list
 * entirely, so the row simply goes, while a resent one comes back with a new Sent and Expires.
 */
export function InviteRowActions({ invite }: { readonly invite: TeamInvite }) {
  const router = useRouter();
  const [opened, setOpened] = useState<Opened>("none");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Adjusting state when something changes, during render rather than in an effect -- react.dev's
  // own recommended shape, and the same one RemoveMemberDialog uses. The reason is what the tap is
  // minted over, so a second opening must never inherit the first attempt's words; this component
  // stays mounted between openings, so nothing else would clear it.
  const [openedSeen, setOpenedSeen] = useState(opened);
  if (opened !== openedSeen) {
    setOpenedSeen(opened);
    if (opened === "revoke") setReason("");
  }

  /**
   * Opening anything clears the last refusal, rather than the next one clearing it on arrival: a
   * sentence about an attempt the member has already replaced is worse than none. The same rule
   * `member-row-menu.tsx`'s own `open` follows.
   */
  function open(next: Opened): void {
    setError(null);
    setOpened(next);
  }

  /**
   * Closes first, then sends -- the order `sessions-plate.tsx`'s own `handleConfirmed` uses for the
   * other no-tap confirmation in this console. A refusal lands in the row's alert either way, and
   * the list is re-read even then: every refusal this can receive is the server saying this page is
   * out of date about which invites are still live.
   */
  async function onResendConfirmed(): Promise<void> {
    setOpened("none");
    const outcome = await resendInvite(invite.id);
    if (outcome.kind === "done") {
      notify.success(s.resentToast);
      router.refresh();
      return;
    }
    setError(outcome.message);
    router.refresh();
  }

  /**
   * spec §D step 3, and only step 3: ConfirmItsYou calls this once /api/tap/verify has answered
   * `{ ok: true }` for a challenge minted over these exact four fields. The tap stays unspent until
   * `console_revoke_invite`'s own `console.use_tap()`, inside the same transaction as the
   * `revoked_at` stamp and the audit row.
   */
  async function onRevokeConfirmed(): Promise<void> {
    const typed = reason;
    setOpened("none");
    const outcome = await revokeInvite(invite.id, typed);
    if (outcome.kind === "done") {
      notify.success(v.revokedToast);
      router.refresh();
      return;
    }
    setError(outcome.message);
    router.refresh();
  }

  return (
    <>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => open("resend")}>
          {s.trigger}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => open("revoke")}>
          {v.trigger}
        </Button>
      </div>
      <ConfirmDialog
        open={opened === "resend"}
        onOpenChange={(next) => {
          if (!next) setOpened("none");
        }}
        title={s.title}
        description={s.detail(invite.email)}
        confirmLabel={s.trigger}
        // The sheet's own `btn btn-primary` (:355), not ConfirmDialog's danger default: resending
        // takes nothing away.
        tone="primary"
        onConfirm={() => onResendConfirmed()}
      />
      <ConfirmItsYou
        open={opened === "revoke"}
        action={REVOKE_ACTION}
        // The invite's own id as console_team returned it -- Postgres's lowercase canonical uuid,
        // byte for byte what `p_invite::text` re-digests. An email holds at most one live invite
        // today, but the id is what the row actually is, the same choice console_remove_key's
        // id-bound digest made (20260921100300_console_remove_key_binds_id.sql).
        target={invite.id}
        // The address, not the role: `console.use_tap('Revoked an invite', p_invite::text,
        // v_invite.email, …)` digests what the database reads for the invite under a lock, and this
        // page's own copy of it is the thing being checked (task-7-addendum.md §4).
        value={invite.email}
        reason={reason}
        summary={v.title}
        hint={v.hint(invite.email)}
        onReasonChange={setReason}
        onCancel={() => setOpened("none")}
        onConfirmed={() => void onRevokeConfirmed()}
      />
      {/*
        Always rendered, empty while there is nothing to say -- the shape member-row-menu.tsx took
        in `37aba03`, and the same reason: a `role="alert"` region inserted already carrying its
        message relies on node-insertion announcement, which current screen readers do handle but
        is the less reliable of the two; a region that is present and then *changes* is the robust
        one. This component drew the conditional shape for a week because it was written from the
        version of member-row-menu.tsx that had the same defect, twenty lines away.

        Capped and left-aligned inside this end-aligned cell: the Actions column is the narrowest on
        the table, and a refusal running its full width would stretch the column rather than wrap.
        `text-pretty` keeps the last line from being one orphaned word. The top margin is
        conditional so an empty region takes no space at all.
      */}
      <p role="alert" className={cn("ml-auto max-w-[34ch] text-pretty text-left text-label font-medium text-ink-alert", error && "mt-1.5")}>
        {error}
      </p>
    </>
  );
}
