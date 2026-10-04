"use client";

import { ChoiceList } from "@/components/ui/choice-list";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";

const f = consoleMessages.frame;

/**
 * The sheet's role picker (ConsoleTeam.dc.html:214-219), now the shared ChoiceList with the roles
 * as its choices. Which roles to draw is the caller's: the invite offers all four, the change-role
 * picker every role but the member's own. The descriptions are imported, never restated
 * (consoleMessages.team.roleDescription).
 */
export function RolePicker({
  value,
  roles,
  labelId,
  onChange,
}: {
  readonly value: ConsoleRole | null;
  readonly roles: readonly ConsoleRole[];
  readonly labelId: string;
  readonly onChange: (role: ConsoleRole) => void;
}) {
  const choices = roles.map((role) => ({ value: role, label: f.roleLabel[role], description: consoleMessages.team.roleDescription[role] }));
  return <ChoiceList value={value} choices={choices} labelId={labelId} onChange={onChange} />;
}
