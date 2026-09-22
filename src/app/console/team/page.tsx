import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireConsoleMember } from "@/console/auth/guard";
import { ConsoleFrame } from "@/console/components/console-frame";
import { NoAccessState } from "@/console/components/frame-states";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { InviteDialog } from "@/console/team/invite-dialog";
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
        {/*
          ConsoleTeam.dc.html:106 draws this primary trigger in the page header's `ph-actions`,
          behind `canManage`. There is no prop for that here because there is nothing for it to
          decide: a non-Owner never reaches this line at all -- they were answered with
          NoAccessState above -- so on this page `canManage` is the same fact as "an Owner is
          reading it". The second, secondary trigger the sheet draws (:157) is inside MembersPlate,
          beside the only-you note.

          `max-sm:hidden`: ConsoleTeamPhone.dc.html draws no trigger here either (0 occurrences of
          these words in the phone sheet against the desktop sheet's two), and the notice below
          takes its place. Both breakpoints stay in the tree and CSS chooses between them, the same
          pattern ConsoleRail and ConsoleRailDrawer already use.
        */}
        <PageHeader
          kicker={m.kicker}
          title={m.title}
          lead={m.lead}
          actions={
            <div className="max-sm:hidden">
              <InviteDialog variant="primary" />
            </div>
          }
        />
        {/*
          ConsoleTeamPhone.dc.html:85, word for word, in the place the sheet puts it: directly under
          the page header and above the first plate. Team is readable on a phone -- the roster, the
          pending invites and the whole Roles table are all drawn there -- and managed on a larger
          screen, which is why the phone sheet draws this one line instead of the eight controls the
          desktop sheet draws. `sm:hidden` alone: the desktop sheet draws no such sentence.
          The same device its sibling phone sheets use ("… to export.", "… to edit").
        */}
        <p className="text-label text-ink-3 sm:hidden">{m.manageOnLargerScreen}</p>
        {/*
          The signed-in Owner's own id goes down with the roster: the row menu's last-Owner guard
          refuses a member acting on their own row, which is a fact about who is reading the page
          and not about the row (task-5-addendum.md §3). `member` is already in hand from the guard
          above, so nothing extra is read for it.
        */}
        <MembersPlate members={team.members} signedInId={member.userId} />
        <InvitesPlate invites={team.invites} />
        <RolesPlate />
      </div>
    </ConsoleFrame>
  );
}
