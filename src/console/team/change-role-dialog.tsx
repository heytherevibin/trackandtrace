"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { DialogClose, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import type { ConsoleRole } from "@/console/auth/member";
import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { consoleMessages } from "@/console/messages";
import { needsAnotherOwner, rolesOfferedInstead } from "@/console/team/role-change";
import { RolePicker } from "@/console/team/role-picker";
import type { TeamMember } from "@/console/team/team";
import { changeRole } from "@/console/team/team-client";

const c = consoleMessages.team.changeRole;
const o = consoleMessages.team.lastOwner;
const f = consoleMessages.frame;
const t = consoleMessages.tap;

// The literal console.use_tap('Changed a role', …) binds
// (supabase/migrations/20260922090000_console_team.sql:205) -- a digest field, never rendered, so it
// lives beside the dialog it feeds rather than in the copy file with the drawn strings, the same
// place invite-dialog.tsx keeps its own INVITE_ACTION.
const CHANGE_ACTION = "Changed a role";

/** dlg_owner (ConsoleTeam.dc.html:334-346): a title, a detail, one primary OK, and no way past it. */
function LastOwnerNotice({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-dialog bg-backdrop transition-opacity duration-(--duration-base) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <AlertDialog.Viewport className="fixed inset-0 z-dialog flex items-center justify-center p-4">
          <AlertDialog.Popup className="blueprint w-full max-w-narrow bg-surface-3 p-6 shadow-3 outline-none transition-[transform,opacity] duration-(--duration-slow) ease-out data-[starting-style]:scale-98 data-[starting-style]:opacity-0 data-[ending-style]:scale-98 data-[ending-style]:opacity-0">
            <Corners />
            <AlertDialog.Title className="text-3xl tracking-head">{o.title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2.5 text-body text-ink-2">{o.detail}</AlertDialog.Description>
            {/* One button, not the Cancel/Confirm pair @/components/ui/confirm-dialog draws: the
                sheet gives dlg_owner a single primary OK, because there is nothing here to confirm
                -- it is the console saying no. */}
            <div className="mt-6 flex justify-end">
              <AlertDialog.Close render={<Button variant="primary">{o.ok}</Button>} />
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/**
 * Where the flow is. `picker` and `blocked` are the two ways it can open; `confirming` and
 * `sending` carry the chosen role so neither can be reached without one, and `done` draws nothing
 * while the page refreshes underneath.
 */
type Stage =
  | { readonly kind: "picker" }
  | { readonly kind: "blocked" }
  | { readonly kind: "confirming"; readonly role: ConsoleRole }
  | { readonly kind: "sending"; readonly role: ConsoleRole }
  | { readonly kind: "done" };

/**
 * Changing one member's role (task-5): the undrawn picker, then TC-01, then PATCH -- or the sheet's
 * own dlg_owner instead of any of it.
 *
 * Two things the sheet does not settle, both ruled in task-5-addendum.md:
 *
 * 1. Nothing draws how the new role is chosen (§2). The sheet's `dialog` enum goes straight from
 *    Row menu to TC-01 with "Support → Admin" already decided. So a small picker stands in first,
 *    reusing the invite's own radiogroup with the member's current role left out. Nothing is
 *    pre-selected: the console has no business guessing which way an Owner meant to move someone,
 *    and a wrong default on an action that signs a member out everywhere is one that gets tapped
 *    through.
 * 2. The last-Owner guard is decided here, from the roster the page already has (§3), and the
 *    refusal is drawn before the picker rather than after a choice -- when no role on offer could
 *    succeed, asking for one and then refusing it wastes the Owner's time over something the
 *    console knew before it opened. `needsAnotherOwner` is the same predicate either way; see
 *    @/console/team/role-change for why its answer is never read out of the database's error.
 *
 * The list refreshes with `router.refresh()`: the three plates are server components, so the page
 * re-runs `getTeam()` and the refreshed roster cannot disagree with the first paint (Ruling 14).
 */
export function ChangeRoleDialog({
  member,
  signedInId,
  activeOwners,
  open,
  onClose,
}: {
  readonly member: TeamMember;
  readonly signedInId: string;
  readonly activeOwners: number;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const offered = rolesOfferedInstead(member.role);
  // Every role this picker could offer is refused, so there is nothing to pick. Both of the
  // database's two cases land here: an Owner on their own row is refused whatever they choose, and
  // for the console's last active Owner the one role that would be allowed -- Owner -- is the role
  // they already hold, which is exactly the one the picker leaves out.
  const blocked = offered.every((next) => needsAnotherOwner(member, next, { signedInId, activeOwners }));

  const [stage, setStage] = useState<Stage>(() => (blocked ? { kind: "blocked" } : { kind: "picker" }));
  const [role, setRole] = useState<ConsoleRole | null>(null);
  const [reason, setReason] = useState("");
  // A refusal the server did send -- a stale tap, or a roster that moved underneath. It goes back
  // on the picker beside the control that would retry it, never into a toast that goes away.
  // Cleared by the next attempt rather than by an edit, because an edit is not what would fix it.
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const roleLabelId = useId();

  // Adjusting state when a prop changes, during render rather than in an effect -- react.dev's own
  // recommended shape, and the same one ConfirmItsYou uses one level down. The row menu keeps this
  // component mounted between openings, so each opening starts clean.
  const [openSeen, setOpenSeen] = useState(open);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) {
      setStage(blocked ? { kind: "blocked" } : { kind: "picker" });
      setRole(null);
      setReason("");
      setAttemptError(null);
    }
  }

  /**
   * spec §D step 3, and only step 3: ConfirmItsYou calls this once /api/tap/verify has answered
   * `{ ok: true }` for a challenge minted over these exact four fields. The tap stays unspent until
   * console_change_role's own console.use_tap(), inside the same transaction as the role update,
   * the session revocation and the audit row. A cancelled or failed tap never reaches this at all.
   */
  async function onConfirmed(next: ConsoleRole): Promise<void> {
    setStage({ kind: "sending", role: next });
    const outcome = await changeRole(member.userId, next, reason);
    if (outcome.kind === "done") {
      notify.success(c.changedToast);
      router.refresh();
      setStage({ kind: "done" });
      onClose();
      return;
    }
    setAttemptError(outcome.message);
    setStage({ kind: "picker" });
  }

  return (
    <>
      <DialogRoot
        open={open && stage.kind === "picker"}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent
          title={c.title(member.name)}
          footer={
            <>
              <DialogClose render={<Button variant="secondary">{t.cancel}</Button>} />
              <Button variant="primary" disabled={role === null} onClick={() => role && setStage({ kind: "confirming", role })}>
                {c.continue}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span id={roleLabelId} className="legend-md text-accent-text">
                {c.newRoleLabel}
              </span>
              <RolePicker value={role} roles={offered} labelId={roleLabelId} onChange={setRole} />
            </div>
            {attemptError !== null ? (
              <p role="alert" className="text-label font-medium text-ink-alert">
                {attemptError}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </DialogRoot>
      <ConfirmItsYou
        open={open && stage.kind === "confirming"}
        action={CHANGE_ACTION}
        // The member's id as text, never their name or email: two members cannot share an id, and
        // 20260921100300_console_remove_key_binds_id.sql is the review that settled it. It goes out
        // exactly as console_team returned it -- Postgres's own uuid, rendered lowercase canonical
        // -- which is byte for byte what `p_member::text` re-digests inside console_change_role.
        target={member.userId}
        value={stage.kind === "confirming" || stage.kind === "sending" ? stage.role : ""}
        reason={reason}
        summary={c.title(member.name)}
        change={{
          label: c.changeLabel,
          before: f.roleLabel[member.role],
          after: stage.kind === "confirming" || stage.kind === "sending" ? f.roleLabel[stage.role] : "",
        }}
        hint={c.hint(member.name)}
        onReasonChange={setReason}
        onCancel={() => {
          // Only a genuine Cancel/Escape/close on TC-01 comes back to the picker. Guarded on the
          // stage so a programmatic close -- this component leaving `confirming` after a tap -- can
          // never reopen the picker over a change that already went through. What was chosen stays
          // chosen: losing it to a mis-tap is a worse answer than the one the sheet does not draw.
          if (stage.kind === "confirming") setStage({ kind: "picker" });
        }}
        onConfirmed={() => {
          if (stage.kind === "confirming") void onConfirmed(stage.role);
        }}
      />
      <LastOwnerNotice open={open && stage.kind === "blocked"} onClose={onClose} />
    </>
  );
}
