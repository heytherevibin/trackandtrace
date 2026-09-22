"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "@/components/ui/toast";
import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { consoleMessages } from "@/console/messages";
import { LastOwnerNotice } from "@/console/team/notice-dialog";
import { needsAnotherOwner } from "@/console/team/role-change";
import type { TeamMember } from "@/console/team/team";
import { removeMember } from "@/console/team/team-client";

const v = consoleMessages.team.removeMember;

// The literal console.use_tap('Removed a member', …) binds
// (supabase/migrations/20260922090000_console_team.sql:295) -- a digest field, never rendered, so
// it lives beside the dialog it feeds rather than in the copy file with the drawn strings.
const REMOVE_ACTION = "Removed a member";

/**
 * Removing one member (task-6): the sheet's own dlg_owner when the floor refuses, and otherwise
 * TC-01 and nothing else -- a bold line, a hint, a reason and a tap, exactly as
 * ConsoleTeam.dc.html's dlg_remove (:313-325) draws it. No Change row, because a removal has no
 * before-and-after pair to show (task-6-addendum.md §1).
 *
 * The guard is Task 5's, reused rather than rebuilt: `needsAnotherOwner` with `null` for the role
 * the member is left holding, because a removed member holds none (task-6-addendum.md §4). That is
 * not a convenience -- `console_remove_member` (:259-305) carries `console_change_role`'s
 * unconditional self-check word for word and then `if v_target.role = 'owner' then
 * require_another_active_owner()`, which is the same floor with its `is distinct from 'owner'` arm
 * already decided. One predicate in the browser, decided from the roster the page already holds,
 * and never from the database's own refusal: that is a developer string arriving with the same
 * 42501 as every other console refusal, so there is nothing in it to tell the cases apart by.
 *
 * The refusal is drawn instead of TC-01 rather than after it, the same order the change-role dialog
 * uses: when nothing the member could do here would succeed, taking a reason and a tap first and
 * then refusing wastes their time over something the console knew before it opened.
 *
 * The list refreshes with `router.refresh()`: the three plates are server components, so the page
 * re-runs `getTeam()` -- and `console_team` leaves a removed member out of the roster entirely,
 * so the row simply goes.
 */
export function RemoveMemberDialog({
  member,
  signedInId,
  activeOwners,
  open,
  onClose,
  onFailed,
}: {
  readonly member: TeamMember;
  readonly signedInId: string;
  readonly activeOwners: number;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Where a refusal goes, and why -- see ResetKeysDialog's own note on the identical prop. */
  readonly onFailed: (message: string) => void;
}) {
  const router = useRouter();
  // `null`: after a removal this member holds no role at all, which is what the migration's own
  // guard means by not testing the new role at all.
  const blocked = needsAnotherOwner(member, null, { signedInId, activeOwners });
  const [reason, setReason] = useState("");

  // Adjusting state when a prop changes, during render rather than in an effect -- react.dev's own
  // recommended shape. The row menu keeps this component mounted between openings.
  const [openSeen, setOpenSeen] = useState(open);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) setReason("");
  }

  /**
   * spec §D step 3, and only step 3: ConfirmItsYou calls this once /api/tap/verify has answered
   * `{ ok: true }` for a challenge minted over these exact four fields. The tap stays unspent until
   * console_remove_member's own console.use_tap(), inside the same transaction as the status
   * change, the session revocation and the audit row.
   */
  async function onConfirmed(): Promise<void> {
    const typed = reason;
    onClose();
    const outcome = await removeMember(member.userId, typed);
    if (outcome.kind === "done") {
      notify.success(v.removedToast);
      router.refresh();
      return;
    }
    // Re-read even though nothing changed, for the same reason the reset does: every refusal this
    // can receive is the server saying this page is out of date, and the stale role is exactly
    // what the next attempt would mint its tap over.
    onFailed(outcome.message);
    router.refresh();
  }

  return (
    <>
      <ConfirmItsYou
        open={open && !blocked}
        action={REMOVE_ACTION}
        // The member's id as text, never their name or email
        // (20260921100300_console_remove_key_binds_id.sql is the review that settled it), exactly
        // as console_team returned it -- byte for byte what `p_member::text` re-digests.
        target={member.userId}
        // The role they hold today, not a new one: `console.use_tap('Removed a member',
        // p_member::text, v_target.role::text, …)` digests what the database reads for the target
        // under a lock, and this page's own copy of it is the thing being checked.
        value={member.role}
        reason={reason}
        summary={v.title(member.name)}
        hint={v.hint(member.name)}
        onReasonChange={setReason}
        onCancel={onClose}
        onConfirmed={() => void onConfirmed()}
      />
      <LastOwnerNotice open={open && blocked} onClose={onClose} />
    </>
  );
}
