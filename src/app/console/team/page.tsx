import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireConsoleMember } from "@/console/auth/guard";
import { ConsoleFrame } from "@/console/components/console-frame";
import { NoAccessState } from "@/console/components/frame-states";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { InvitesPlate } from "@/console/team/invites-plate";
import { MembersPlate } from "@/console/team/members-plate";
import { RolesPlate } from "@/console/team/roles-plate";
import { getTeam } from "@/console/team/team";
import { AppError } from "@/services/errors";

const m = consoleMessages.team;

export const metadata: Metadata = { title: m.pageTitle };

/**
 * Team (ConsoleTeam.dc.html): who is in this console, which invites are outstanding, and what each
 * role can reach (task-3-brief.md). Owner-only -- but the guard call below carries no role floor,
 * unlike the GET route beside it (src/app/console/api/team/route.ts), because a non-Owner must still
 * come back with a `member` to render inside ConsoleFrame: NoAccessState takes a role and a frame to
 * sit in, and a `requireConsoleMember("owner")` 403 here would have nothing to render it with except
 * the console's generic error boundary, not the sheet's own no-access state
 * (task-3-addendum.md §4/§1 -- "a non-Owner gets NoAccessState, not a redirect").
 * `console_team()` still re-checks `console.require_role('owner')` itself, so this page's own check
 * is honesty, not the security boundary (task-3-brief.md's own words for it).
 *
 * Catches only UNAUTHENTICATED, exactly as /keys does (src/app/console/keys/page.tsx's own long
 * comment on why): a missing or ended session goes to /login; anything else -- wrong grants, a
 * database that is down -- is a fault left to propagate to src/app/console/error.tsx rather than
 * read as an ordinary sign-out.
 */
export default async function TeamPage() {
  const member = await requireConsoleMember().catch((err: unknown) => {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") return null;
    throw err;
  });
  if (!member) redirect(consoleHref("/login"));

  if (member.role !== "owner") {
    return (
      <ConsoleFrame member={member}>
        <NoAccessState role={member.role} />
      </ConsoleFrame>
    );
  }

  const team = await getTeam();

  return (
    <ConsoleFrame member={member}>
      <div className="flex flex-col gap-8">
        <PageHeader kicker={m.kicker} title={m.title} lead={m.lead} />
        <MembersPlate members={team.members} />
        <InvitesPlate invites={team.invites} />
        <RolesPlate />
      </div>
    </ConsoleFrame>
  );
}
