"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "@/components/ui/toast";
import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { consoleMessages } from "@/console/messages";
import { NoticeDialog } from "@/console/team/notice-dialog";
import type { TeamMember } from "@/console/team/team";
import { resetKeys } from "@/console/team/team-client";

const r = consoleMessages.team.resetKeys;

// The literal console.use_tap('Reset a member''s keys', …) binds
// (supabase/migrations/20260922090000_console_team.sql:241) -- SQL's doubled quote is one
// apostrophe, so the string the browser mints over is exactly "Reset a member's keys". A digest
// field, never rendered, so it lives beside the dialog it feeds rather than in the copy file with
// the drawn strings, the same place invite-dialog.tsx keeps its own INVITE_ACTION.
const RESET_ACTION = "Reset a member's keys";

/**
 * Resetting one member's keys (task-6): TC-01 and nothing else, exactly as ConsoleTeam.dc.html's
 * dlg_reset (:288-300) draws it -- a bold line, a hint, a reason and a tap. No picker in front of
 * it, because nothing is being chosen, and no Change row inside it, because there is no
 * before-and-after pair to show (task-6-addendum.md §1).
 *
 * **No Owner floor, but a hard self-check.** The two are separate rules and only one of them
 * exists. There is no last-Owner guard: `console_reset_keys` never touches `status` or `role`, so
 * resetting someone else's keys cannot leave the console short of an Owner, and a sole Owner may
 * reset any other member's keys freely.
 *
 * A member resetting their OWN keys is refused outright, here and in the database
 * (20260922120000_console_reset_keys_blocks_self.sql). Task 6 first shipped this unguarded on the
 * addendum's stated reasoning that a self-reset was "recoverable, and consistent with My keys
 * letting a member remove their own keys". Both halves are false, and the second is inverted: My
 * keys refuses to remove a key below a floor of two (`console_remove_key`,
 * 20260921100000_console_my_keys.sql:113) *precisely so a member can never reach zero*. A self-reset
 * deletes every key, leaves `status` untouched, and closes every way back -- no key to sign in
 * with, no re-invite (console_invite_member refuses any member row that is not 'removed'), no
 * re-enrolment, and for a console's only Owner no fresh first-Owner link either, because
 * `has_owner()` still counts them. The migration carries the full trace.
 *
 * So on the signed-in member's own row this answers with a notice instead of TC-01 -- the shape
 * Change role and Remove already use there, with its own words, because dlg_owner's are about
 * Owners and this rule is not. The menu stays whole and the console says no, rather than the
 * sheet's drawn hint promising "two new keys at next sign-in" on the one row where there is no
 * next sign-in.
 *
 * The `value` the tap is minted over is the key count this page rendered. That is a real race and
 * the correct one: the database recounts inside the transaction that deletes them, so a key added
 * or removed in between means the digests differ and the reset is refused. Failing closed is right;
 * what the member reads is `resetKeys.tapMismatch`, which asks for a reload rather than a bare
 * retry, because the same stale page would mint the same wrong number (task-6-addendum.md §3).
 *
 * The count that comes back is the server's, not this page's: `console_reset_keys` returns what it
 * actually deleted, and the toast reports that.
 */
export function ResetKeysDialog({
  member,
  signedInId,
  open,
  onClose,
  onFailed,
}: {
  readonly member: TeamMember;
  /** Who is reading the page -- `requireConsoleMember()`'s own `userId`, which the page already has. */
  readonly signedInId: string;
  readonly open: boolean;
  readonly onClose: () => void;
  /**
   * Where a refusal goes. TC-01 has already closed by the time one comes back -- ConfirmItsYou's
   * `onConfirmed` fires the moment the tap verifies, before the request this dialog then sends --
   * so there is no dialog left to show it in, the same thing src/console/account/keys-plate.tsx
   * found for Remove. It goes up to whatever owns this dialog, which keeps it on screen beside the
   * control that would retry it, rather than into a toast that goes away.
   */
  readonly onFailed: (message: string) => void;
}) {
  const router = useRouter();
  // The whole guard, and deliberately not `needsAnotherOwner`: that predicate carries an Owner
  // floor this action has no business applying, and it would answer "no" here for a reason that is
  // not the reason. This mirrors one line of the migration and nothing else --
  // `if p_member = v_member.user_id then raise` -- which is unconditional, checked before the
  // target row is read, and true for every role.
  const blocked = member.userId === signedInId;
  const [reason, setReason] = useState("");

  // Adjusting state when a prop changes, during render rather than in an effect -- react.dev's own
  // recommended shape, and the same one ConfirmItsYou uses one level down. The row menu keeps this
  // component mounted between openings, so each opening starts with an empty reason.
  const [openSeen, setOpenSeen] = useState(open);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) setReason("");
  }

  /**
   * spec §D step 3, and only step 3: ConfirmItsYou calls this once /api/tap/verify has answered
   * `{ ok: true }` for a challenge minted over these exact four fields. The tap stays unspent until
   * console_reset_keys' own console.use_tap(), inside the same transaction as the delete, the
   * session revocation and the audit row. A cancelled or failed tap never reaches this at all.
   */
  async function onConfirmed(): Promise<void> {
    const typed = reason;
    // Closed first, exactly as keys-plate.tsx closes before its own DELETE: the tap is done and the
    // dialog has nothing left to say, and leaving it up would invite a second tap on an action
    // already in flight.
    onClose();
    const outcome = await resetKeys(member.userId, typed);
    if (outcome.kind === "done") {
      notify.success(r.resetToast(outcome.count));
      router.refresh();
      return;
    }
    // The roster is re-read even though nothing changed. A stale key count is exactly what a
    // digest mismatch is about, and leaving the page stale would have the next attempt mint over
    // the same wrong number and fail in the same way -- the reasoning keys-plate.tsx spells out
    // for its own re-read after a refusal. The message is handed up first, so it is on screen
    // whatever the refresh does.
    onFailed(outcome.message);
    router.refresh();
  }

  return (
    <>
      <ConfirmItsYou
        open={open && !blocked}
        action={RESET_ACTION}
        // The member's id as text, never their name or email: two members cannot share an id, and
        // 20260921100300_console_remove_key_binds_id.sql is the review that settled it. It goes out
        // exactly as console_team returned it -- Postgres's own uuid, rendered lowercase canonical
        // -- which is byte for byte what `p_member::text` re-digests inside console_reset_keys.
        target={member.userId}
        // The count console_team put on this row, which is what console_reset_keys recounts and
        // re-digests. Never a constant: the sheet's "two new keys" is about the floor at next
        // sign-in, not about how many this member holds now.
        value={String(member.keyCount)}
        reason={reason}
        summary={r.title(member.name)}
        hint={r.hint(member.name)}
        onReasonChange={setReason}
        onCancel={onClose}
        onConfirmed={() => void onConfirmed()}
      />
      <NoticeDialog open={open && blocked} title={r.ownKeys.title} detail={r.ownKeys.detail} ok={r.ownKeys.ok} onClose={onClose} />
    </>
  );
}
