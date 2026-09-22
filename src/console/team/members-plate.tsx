import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Led } from "@/components/ui/led";
import { Plate } from "@/components/ui/plate";
import { consoleMessages } from "@/console/messages";
import { InviteDialog } from "@/console/team/invite-dialog";
import { MemberRowMenu } from "@/console/team/member-row-menu";
import type { TeamMember } from "@/console/team/team";
import { formatRelative, formatTime, TIME_ZONE } from "@/utils/datetime";

const m = consoleMessages.team.members;
const f = consoleMessages.frame;
const clock = consoleMessages.frameSignedIn.clock;

// Compares two moments by IST calendar day, not by an elapsed-time threshold: ConsoleTeam.dc.html's
// own two Last-active shapes ("14:02 IST" for today, "3 days ago" for anything older, :118/:126)
// are told apart this way, so a member last active at 00:05 IST still reads as a time rather than
// "23 hr ago". en-CA gives a stable "YYYY-MM-DD" string to compare, entirely inside Asia/Kolkata.
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * "14:02 IST" for a moment on today's IST calendar day, "3 days ago" for an older one, "Never" for
 * a member who has no last-active moment at all (not drawn on the sheet -- every mocked row already
 * has one -- but console_team's own last_active_at is genuinely null for a member who accepted an
 * invite and has yet to sign in with a key; see team.ts's own note and task-3-report.md).
 */
function formatLastActive(value: string | null, now: Date): string {
  if (!value) return m.lastActiveNever;
  const at = new Date(value);
  return dayKeyFormat.format(at) === dayKeyFormat.format(now) ? `${formatTime(at)} ${clock.ist}` : formatRelative(at, now);
}

/**
 * The Members plate (ConsoleTeam.dc.html): who is in this console, in the order console_team
 * already returns them (by role rank, then name). Every row carries the sheet's own Actions trigger
 * and the menu behind it (:145, :193-199), with all three of its items now wired -- Change role by
 * Task 5, Reset keys and Remove by Task 6.
 *
 * Still a server component. Only the menu inside each Actions cell is "use client", the same split
 * the only-you row's InviteDialog already draws, so the roster this plate renders is the roster the
 * server read -- and `router.refresh()` after a change re-runs `getTeam()` rather than patching a
 * client-side copy that could disagree with it (task-4-addendum.md §5, Ruling 14).
 *
 * `signedInId` and the active-Owner count are what the row menu's last-Owner guard reads
 * (task-5-addendum.md §3), for a removal as well as a role change (task-6-addendum.md §4). Both are
 * facts about the roster as a whole, so they are worked out here, once, rather than by each row:
 * `activeOwners` counts what console.require_another_active_owner() counts -- every member who is
 * an Owner *and* active -- and not "is this row the only Owner".
 *
 * The sheet draws a distinct Only-you state for a console with exactly one member
 * (task-3-addendum.md §1): the same single-row table this component always renders, plus a note
 * below it that this plate adds once `members.length === 1` -- a console can never genuinely reach
 * zero members (the database refuses to demote or remove a console's last Owner), so that is the
 * only extra case there is.
 */
export function MembersPlate({ members, signedInId }: { readonly members: readonly TeamMember[]; readonly signedInId: string }) {
  const now = new Date();
  const activeOwners = members.filter((row) => row.role === "owner" && row.status === "active").length;

  const columns: readonly Column<TeamMember>[] = [
    { key: "name", header: m.columns.name, cell: (row) => <span className="font-medium">{row.name}</span> },
    { key: "email", header: m.columns.email, cell: (row) => row.email },
    { key: "role", header: m.columns.role, cell: (row) => <Badge variant="neutral">{f.roleLabel[row.role]}</Badge> },
    { key: "keys", header: m.columns.keys, cell: (row) => m.keysCell(row.keyCount, row.status), numeric: true },
    { key: "lastActive", header: m.columns.lastActive, cell: (row) => formatLastActive(row.lastActiveAt, now), numeric: true },
    {
      key: "status",
      header: m.columns.status,
      cell: (row) => (
        <span className="inline-flex items-center gap-2">
          <Led lit={row.status === "active"} />
          {m.status[row.status]}
        </span>
      ),
    },
    // Visually hidden, matching ConsoleTeam.dc.html:112's own <span style="position: absolute; …">
    // for this header. Through `hideHeader` rather than a wrapped element, so the header stays a
    // plain string: DataTable also prints it as the stacked phone layout's row label, and a DOM
    // attribute can only carry a string (src/components/ui/data-table.tsx's own note).
    //
    // `phoneHidden`: ConsoleTeamPhone.dc.html draws no Actions column and hard-forces the row menu
    // off at :254 (`var dialogs = true ? { dlg_menu: false } : {…}`), drawing instead one line --
    // "Open on a larger screen to manage the team." -- above the plates. Team is readable on a
    // phone and managed on a larger screen; the notice is in the page, this is the half that takes
    // the controls away, and `display: none` takes them out of the tab order and the accessibility
    // tree with them rather than leaving a hidden button a keyboard could still reach.
    {
      key: "actions",
      header: m.columns.actions,
      hideHeader: true,
      phoneHidden: true,
      cell: (row) => <MemberRowMenu member={row} signedInId={signedInId} activeOwners={activeOwners} />,
      align: "end",
    },
  ];

  return (
    <Plate as="section" title={m.title} titleId="team-members" headingLevel={2} meta={[m.count(members.length)]} padding="none">
      <DataTable columns={columns} rows={members} rowKey={(row) => row.userId} caption={m.tableCaption} />
      {members.length === 1 ? (
        // ConsoleTeam.dc.html:157: the note and a *secondary* "Invite a member" on one row, the
        // note taking the space the button does not. The primary trigger with the same words is in
        // the page header (:106); both open the one InviteDialog, which owns its own open state, so
        // two instances here and there is simpler than lifting a flag into the page
        // (task-4-addendum.md §5).
        <div className="flex items-center gap-4 border-t border-line px-5 pb-4 pt-3.5">
          <p className="grow text-sm text-ink-2">{m.onlyYouNote}</p>
          {/* ConsoleTeamPhone.dc.html draws this state as the note alone (:112) -- no trigger
              beside it, the same way it draws no row actions. `max-sm:hidden` rather than a
              conditional render for the reason console-rail.tsx gives for its own pair: both
              breakpoints stay in the tree and CSS chooses, so a resize cannot leave the page in a
              state neither branch rendered. The dialog itself portals to the body, so only the
              trigger goes. */}
          <div className="max-sm:hidden">
            <InviteDialog variant="secondary" />
          </div>
        </div>
      ) : null}
    </Plate>
  );
}
