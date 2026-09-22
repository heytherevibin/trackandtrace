import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Plate } from "@/components/ui/plate";
import { consoleMessages } from "@/console/messages";
import { InviteRowActions } from "@/console/team/invite-row-actions";
import type { TeamInvite } from "@/console/team/team";
import { formatDate } from "@/utils/datetime";

const m = consoleMessages.team.invites;
const f = consoleMessages.frame;

/**
 * The Pending invites plate (ConsoleTeam.dc.html): invites an Owner sent that nobody has accepted
 * or revoked yet, in the order console_team already returns them (created_at, then id).
 *
 * Task 3 left the Actions column off because it had nothing to put in it -- Resend and Revoke were
 * Task 7's (task-3-report.md) -- and this is Task 7: the sheet's own fifth header (:163) and the two
 * inline ghost buttons under it are here now. Still a server component; only InviteRowActions inside
 * each Actions cell is "use client", the same split MembersPlate already draws, so the list this
 * plate renders is the list the server read -- and `router.refresh()` after a resend or a revoke
 * re-runs `getTeam()` rather than patching a client-side copy that could disagree with it
 * (task-4-addendum.md §5, Ruling 14).
 *
 * The sheet draws no empty state for this table, so neither does this: a console with no pending
 * invites gets the plate and its headers and no rows.
 */
export function InvitesPlate({ invites }: { readonly invites: readonly TeamInvite[] }) {
  const columns: readonly Column<TeamInvite>[] = [
    { key: "email", header: m.columns.email, cell: (row) => row.email },
    { key: "role", header: m.columns.role, cell: (row) => <Badge variant="neutral">{f.roleLabel[row.role]}</Badge> },
    { key: "sent", header: m.columns.sent, cell: (row) => formatDate(row.sentAt), numeric: true },
    { key: "expires", header: m.columns.expires, cell: (row) => formatDate(row.expiresAt), numeric: true },
    // Visually hidden, matching ConsoleTeam.dc.html:163's own <span style="position: absolute; …">
    // for this header. Through `hideHeader` rather than a wrapped element, so the header stays a
    // plain string: DataTable also prints it as the stacked phone layout's row label, and a DOM
    // attribute can only carry a string (src/components/ui/data-table.tsx's own note).
    {
      key: "actions",
      header: m.columns.actions,
      hideHeader: true,
      cell: (row) => <InviteRowActions invite={row} />,
      align: "end",
    },
  ];

  return (
    <Plate as="section" title={m.title} titleId="team-invites" headingLevel={2} padding="none">
      <DataTable columns={columns} rows={invites} rowKey={(row) => row.id} caption={m.tableCaption} />
    </Plate>
  );
}
