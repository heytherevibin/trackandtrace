"use client";

import { useState } from "react";
import { MoreHorizontalFilled } from "@/components/icons";
import { IconButton } from "@/components/ui/icon-button";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { consoleMessages } from "@/console/messages";
import { ChangeRoleDialog } from "@/console/team/change-role-dialog";
import { RemoveMemberDialog } from "@/console/team/remove-member-dialog";
import { ResetKeysDialog } from "@/console/team/reset-keys-dialog";
import type { TeamMember } from "@/console/team/team";

const c = consoleMessages.team.changeRole;

/** Which of the three dialogs this row has open, if any. One at a time, so two can never stack. */
type Opened = "none" | "role" | "reset" | "remove";

/**
 * One member's row actions (ConsoleTeam.dc.html:145 for the trigger, :193-199 for the menu):
 * Change role, Reset keys, a separator, then Remove.
 *
 * Task 5 drew the whole menu, separator included, and wired its first item, leaving the other two
 * disabled so the menu would not have to be rebuilt around new items later (task-5-addendum.md §5).
 * Task 6 takes them up: two `disabled` props off, two dialogs added, and nothing about the menu
 * itself changed.
 *
 * The dialogs sit outside MenuContent deliberately: Base UI closes the popup when an item is
 * activated, and a dialog rendered inside it would go with it. The refusal alert is out here for
 * the same reason, and for one more.
 *
 * That alert is where a refused reset or removal lands. TC-01 has already closed by the time one
 * comes back -- ConfirmItsYou's `onConfirmed` fires the moment the tap verifies, before the request
 * the dialog then sends -- so there is no dialog left to show it in. This is the same problem
 * src/console/account/keys-plate.tsx met for Remove, and it is answered the same way: an alert that
 * stays on screen next to the thing that refused, never a toast, which is a notice that goes away
 * while a refusal is something a member has to act on. It sits in the row rather than above the
 * table because the plates are server components (Ruling 14) and this menu is the only client
 * component the row has; the change-role dialog keeps its own refusal on its picker instead,
 * because unlike these two it still has a dialog open to put one in.
 */
export function MemberRowMenu({
  member,
  signedInId,
  activeOwners,
}: {
  readonly member: TeamMember;
  readonly signedInId: string;
  readonly activeOwners: number;
}) {
  const [opened, setOpened] = useState<Opened>("none");
  const [error, setError] = useState<string | null>(null);

  /**
   * Opening anything clears the last refusal, rather than the next one clearing it on arrival: a
   * sentence about an attempt the member has already replaced is worse than none. The same rule
   * Task 5's picker alert follows, and keys-plate.tsx's own `openRemove` before it.
   */
  function open(next: Opened): void {
    setError(null);
    setOpened(next);
  }

  return (
    <>
      <MenuRoot>
        <MenuTrigger
          render={
            // The sheet's `box box-icon box-bare box-sm` with three filled dots, named after the
            // member (:145) -- one trigger per row, so a name is the only thing telling them apart.
            <IconButton label={c.menu(member.name)} icon={<MoreHorizontalFilled className="size-4" aria-hidden="true" />} size="sm" />
          }
        />
        <MenuContent>
          <MenuItem onClick={() => open("role")}>{c.trigger}</MenuItem>
          <MenuItem onClick={() => open("reset")}>{c.resetKeys}</MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => open("remove")}>{c.remove}</MenuItem>
        </MenuContent>
      </MenuRoot>
      <ChangeRoleDialog
        member={member}
        signedInId={signedInId}
        activeOwners={activeOwners}
        open={opened === "role"}
        onClose={() => setOpened("none")}
      />
      {/* No guard props: console_reset_keys has no owner floor and no self-check, so an Owner may
          reset their own keys (task-6-addendum.md §4). */}
      <ResetKeysDialog member={member} open={opened === "reset"} onClose={() => setOpened("none")} onFailed={setError} />
      <RemoveMemberDialog
        member={member}
        signedInId={signedInId}
        activeOwners={activeOwners}
        open={opened === "remove"}
        onClose={() => setOpened("none")}
        onFailed={setError}
      />
      {error ? (
        // Capped and left-aligned inside this end-aligned cell: the Actions column is the narrowest
        // on the table, and a refusal running its full width would stretch the column rather than
        // wrap. `text-pretty` keeps the last line from being one orphaned word.
        <p role="alert" className="ml-auto mt-1.5 max-w-[34ch] text-pretty text-left text-label font-medium text-ink-alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
