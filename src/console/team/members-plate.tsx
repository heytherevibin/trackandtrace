import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Led } from "@/components/ui/led";
import { Plate } from "@/components/ui/plate";
import { consoleMessages } from "@/console/messages";
import { InviteDialog } from "@/console/team/invite-dialog";
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
 * already returns them (by role rank, then name). Row actions -- Change role, Reset keys, Remove --
 * sit behind a Row menu Tasks 5 and 6 build (task-3-addendum.md §4); the Actions column exists so
 * the table's shape does not change under them, but every cell is empty here.
 *
 * The sheet draws a distinct Only-you state for a console with exactly one member
 * (task-3-addendum.md §1): the same single-row table this component always renders, plus a note
 * below it that this plate adds once `members.length === 1` -- a console can never genuinely reach
 * zero members (the database refuses to demote or remove a console's last Owner), so that is the
 * only extra case there is.
 */
export function MembersPlate({ members }: { readonly members: readonly TeamMember[] }) {
  const now = new Date();

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
    // attribute can only carry a string (src/components/ui/data-table.tsx's own note). Empty cells:
    // this task leaves the row menu for Tasks 5 and 6 rather than building three buttons someone
    // will move (task-3-addendum.md §4).
    { key: "actions", header: m.columns.actions, hideHeader: true, cell: () => null, align: "end" },
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
          <InviteDialog variant="secondary" />
        </div>
      ) : null}
    </Plate>
  );
}
