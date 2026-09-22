import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { getAuditLog, type AuditPage } from "@/console/audit/audit";
import { EntriesPlate } from "@/console/audit/entries-plate";
import { auditQueryFor, parseAuditFilters, type AuditSearchParams } from "@/console/audit/filters";
import { writeConsoleAudit } from "@/console/auth/audit";
import { createConsoleServiceDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { ROLE_RANK, type ConsoleMember } from "@/console/auth/member";
import { consoleAddressHash, consoleEnvironment, deviceLabel } from "@/console/auth/session";
import { ConsoleFrame } from "@/console/components/console-frame";
import { NoAccessState } from "@/console/components/frame-states";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { log } from "@/services/log";
import { clientIp } from "@/services/rate-limit";

const m = consoleMessages.audit;

export const metadata: Metadata = { title: m.pageTitle };

type ReadHeaders = Pick<Headers, "get">;

/**
 * The read, recorded. `AuditLog.dc.html:312` draws an `Opened the audit log` / `Refused` row, so
 * opening this module is itself an audited action -- and Task 1 writes nothing, by this phase's
 * append-only constraint, so it comes from here (task-2-addendum.md §5).
 *
 * **One row per open, not one per request.** The GET route the Entries plate re-reads on every
 * filter change and every page turn writes none: otherwise an Owner scrolling their own log buries
 * the one fact worth recording under a row per keystroke, in a table nothing can delete from.
 *
 * A prefetch must not be recorded: once module 14 is `built`, the rail draws a link to it on every
 * console page, and Next prefetches links it can see. A prefetch is not someone opening the log, and
 * an append-only record of something that did not happen cannot be taken back. `next-router-prefetch`
 * is the header Next sends for exactly that request; a missing header falls through to writing the
 * row, which is the safe direction -- a false negative costs one unrecorded open, a false positive is
 * permanent and untrue.
 *
 * **What actually protects this page is not the header check below.** Measured against the running
 * server rather than reasoned about (tests/e2e/console-auth/audit-log.spec.ts, and the trace of
 * Next 16.3.4's own source beside each claim):
 *
 * - A request carrying `Next-Router-Prefetch: 1` is answered from the route shell and **this page is
 *   never rendered for it at all** -- 314 bytes with none of the page's own content in it, against
 *   85 KB for the same request without the header. So the check below is belt-and-braces: correct,
 *   unreachable on this version, and worth keeping for the version where it is not.
 * - The request that *does* render this page in full, and carries no prefetch header to tell it
 *   apart from a navigation, is `FetchStrategy.Full`:
 *     - `next/dist/client/app-dir/link.js:108-110` turns the `prefetch` prop into an intent --
 *       absent is `'auto'`, `true` is `'full'`, `false` is `'none'`.
 *     - `link.js:403-414` maps `'auto'` to `FetchStrategy.PPR` and `'full'` to `FetchStrategy.Full`.
 *     - `segment-cache/cache.js:1195` and `:1511` (the PPR paths) set
 *       `NEXT_ROUTER_PREFETCH_HEADER: '1'`. That is why the rail is safe today: its `<Link>`
 *       (src/console/components/console-rail.tsx:34) passes no `prefetch` prop.
 *     - `cache.js:1954-1958` is `FetchStrategy.Full` -- a bare `break`, **no prefetch header**.
 *
 *   So `<Link prefetch>` pointing here would render this page on every viewport impression, arrive
 *   indistinguishable from a real open, and write a permanent untrue row. Nothing in the request can
 *   be checked to stop it.
 *
 * The protection is therefore a rule about links, not a rule about requests, and it is enforced by
 * `tests/unit/console/audit/prefetch-guard.test.tsx`, which fails if any console link sets
 * `prefetch`. `prefetch={false}` is safe (`'none'` prefetches nothing at all) and is allowed. The
 * e2e pins both measurements above, so the day Next changes either one, a test says so.
 *
 * **The check below suppresses; it never grants.** An Admin who may already read this log can hide
 * their own row with `curl -H 'Next-Router-Prefetch: 1'`. It reaches no data they could not already
 * reach, and it cannot forge a row or hide anyone else's. That is the accepted limit of any
 * header-based guard, written down here rather than left to be discovered: closing it would need a
 * signal a client cannot set, and there is none on this path.
 *
 * `after()` rather than a bare await: writing history must never be what breaks the page it
 * describes (src/console/auth/audit.ts's own rule), and this way the member's page is already on
 * its way before the row is written. `writeConsoleAudit` swallows its own failures; the try/catch
 * is for the service client itself, which throws when the deployment has no secret key.
 */
function recordOpened(member: ConsoleMember, allowed: boolean, head: ReadHeaders): void {
  after(async () => {
    try {
      await writeConsoleAudit(createConsoleServiceDb(), {
        actor: member.userId,
        actorName: member.name,
        actorRole: member.role,
        sessionLabel: deviceLabel(head.get("user-agent")),
        // Module 14 sits in the rail's "Record" group (src/console/nav.ts). The six names in
        // src/console/auth/audit.ts were written before any module read anything, and the column
        // itself is free text -- so this is a seventh, not a stretch of one of the six.
        category: "record",
        action: "Opened the audit log",
        target: "Audit log",
        // The sheet draws both halves: Asha's own rows as Done, and Meera the Viewer's attempt at
        // this very module as Refused.
        result: allowed ? "done" : "refused",
        addressHash: consoleAddressHash(clientIp(null, head.get("x-forwarded-for"))),
      });
    } catch (err) {
      log.warn("[console] the audit log's own open could not be recorded", { message: err instanceof Error ? err.message : String(err) });
    }
  });
}

/**
 * Audit log (AuditLog.dc.html): every action taken in the console, who took it, when and why.
 * Owner and Admin both -- Main.dc.html:293-298 gives module 14 to each, and
 * `console.require_role('admin')` inside `console_audit` is a floor that ranks rather than an
 * equality, so both pass and Support and Viewer are refused.
 *
 * The guard call here carries **no** role floor, unlike the GET route beside it
 * (src/app/console/api/audit/route.ts), for the reason src/app/console/team/page.tsx spells out at
 * length: a role below the floor must still come back with a `member` to render inside
 * ConsoleFrame, because NoAccessState takes a role and a frame to sit in, and a 403 here would have
 * nothing to render it with except the console's generic error boundary. `console_audit` re-checks
 * the floor itself, so this page's own check is honesty, not the security boundary.
 *
 * Catches only UNAUTHENTICATED, exactly as /keys and /team do: a missing or ended session goes to
 * /login; anything else -- wrong grants, a database that is down -- is a fault left to propagate to
 * src/app/console/error.tsx rather than read as an ordinary sign-out.
 *
 * A failed *read*, by contrast, is answered in the page rather than thrown, and that is a
 * difference from /keys rather than an inconsistency with it: /keys' own comment notes that the
 * sheet's error copy "is not in the brief's quoted-copy list, so it is not transcribed here". This
 * module's is -- "The audit log didn't load" / "The console couldn't reach its database." /
 * "Retry" -- and a Retry button only means anything if there is a page left to press it on.
 */
export default async function AuditLogPage({ searchParams }: { readonly searchParams: Promise<AuditSearchParams> }) {
  const member = await requireConsoleMember().catch((err: unknown) => {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") return null;
    throw err;
  });
  if (!member) redirect(consoleHref("/login"));

  const head = await headers();
  const environment = consoleEnvironment();
  const allowed = ROLE_RANK[member.role] >= ROLE_RANK.admin;

  if (head.get("next-router-prefetch") === null) recordOpened(member, allowed, head);

  if (!allowed) {
    return (
      <ConsoleFrame member={member}>
        <NoAccessState role={member.role} />
      </ConsoleFrame>
    );
  }

  const filters = parseAuditFilters(await searchParams, environment);
  // `null`, not a throw: the plate draws the sheet's own error state and offers the Retry that
  // re-reads from the GET route, which is a real recovery -- a reload would only re-run this.
  const page: AuditPage | null = await getAuditLog(auditQueryFor(filters, new Date())).catch(() => null);

  return (
    <ConsoleFrame member={member}>
      <div className="flex flex-col gap-8">
        <PageHeader kicker={m.kicker} title={m.title} lead={m.lead} />
        <EntriesPlate initial={page} filters={filters} environment={environment} />
      </div>
    </ConsoleFrame>
  );
}
