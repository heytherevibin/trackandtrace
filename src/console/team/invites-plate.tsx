import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Plate } from "@/components/ui/plate";
import { consoleMessages } from "@/console/messages";
import type { TeamInvite } from "@/console/team/team";
import { formatDate } from "@/utils/datetime";

const m = consoleMessages.team.invites;
const f = consoleMessages.frame;

/**
 * The Pending invites plate (ConsoleTeam.dc.html): invites an Owner sent that nobody has accepted
 * or revoked yet, in the order console_team already returns them (created_at, then id). No Actions
 * column: unlike Members, the brief's own copy list names no fifth header for this table, matching
 * the sheet -- Resend and Revoke are Task 7's (task-3-report.md), and this task leaves the plate
 * without a column to hold them rather than one with empty cells nobody asked for.
 */
export function InvitesPlate({ invites }: { readonly invites: readonly TeamInvite[] }) {
  const columns: readonly Column<TeamInvite>[] = [
    { key: "email", header: m.columns.email, cell: (row) => row.email },
    { key: "role", header: m.columns.role, cell: (row) => <Badge variant="neutral">{f.roleLabel[row.role]}</Badge> },
    { key: "sent", header: m.columns.sent, cell: (row) => formatDate(row.sentAt), numeric: true },
    { key: "expires", header: m.columns.expires, cell: (row) => formatDate(row.expiresAt), numeric: true },
  ];

  return (
    <Plate as="section" title={m.title} titleId="team-invites" headingLevel={2} padding="none">
      <DataTable columns={columns} rows={invites} rowKey={(row) => row.id} caption={m.tableCaption} />
    </Plate>
  );
}
