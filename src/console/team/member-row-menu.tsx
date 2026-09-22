"use client";

import { useState } from "react";
import { MoreHorizontalFilled } from "@/components/icons";
import { IconButton } from "@/components/ui/icon-button";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { consoleMessages } from "@/console/messages";
import { ChangeRoleDialog } from "@/console/team/change-role-dialog";
import type { TeamMember } from "@/console/team/team";

const c = consoleMessages.team.changeRole;

/**
 * One member's row actions (ConsoleTeam.dc.html:145 for the trigger, :193-199 for the menu):
 * Change role, Reset keys, a separator, then Remove.
 *
 * Task 5 owns the menu and its first item only. Reset keys and Remove are Task 6's and are drawn
 * here disabled -- the whole menu the sheet draws exists from the start, separator included, so
 * Task 6 removes two `disabled` props and adds two handlers rather than rebuilding the menu around
 * new items (task-5-addendum.md §5). Disabled rather than absent because the sheet draws three
 * items: an item that is visibly not yet available is a smaller lie than a menu that is missing two
 * of them.
 *
 * The dialog sits outside MenuContent deliberately: Base UI closes the popup when an item is
 * activated, and a dialog rendered inside it would go with it. MemberMenu keeps its own error alert
 * out here for the same reason.
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
  const [changing, setChanging] = useState(false);

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
          <MenuItem onClick={() => setChanging(true)}>{c.trigger}</MenuItem>
          <MenuItem disabled>{c.resetKeys}</MenuItem>
          <MenuSeparator />
          <MenuItem disabled>{c.remove}</MenuItem>
        </MenuContent>
      </MenuRoot>
      <ChangeRoleDialog member={member} signedInId={signedInId} activeOwners={activeOwners} open={changing} onClose={() => setChanging(false)} />
    </>
  );
}
