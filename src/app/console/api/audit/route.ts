import { getAuditLog } from "@/console/audit/audit";
import { auditQueryFor, parseAuditFilters } from "@/console/audit/filters";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { jsonError, jsonOk } from "@/services/api-response";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit -- one page of the audit log, filtered. Unlike every other console GET so far,
 * this one has a browser caller from the day it ships: the Audit log page renders its first page
 * server-side and the Entries plate re-reads from here on every filter change and every page turn
 * (src/console/audit/entries-plate.tsx).
 *
 * **It writes no audit row, and that is the point** (task-2-addendum.md §5). The page's own server
 * render writes the single "Opened the audit log" row the sheet draws; if this route wrote one too,
 * an Owner scrolling their own log would bury the one fact worth recording -- that someone opened
 * it -- under a row per keystroke. The read is audited once per open, not once per request.
 *
 * `requireConsoleMember("admin")` carries the module's role floor here, unlike the page beside it,
 * which deliberately carries none: a route has no frame to render the sheet's no-access state in,
 * so a role below the floor gets a 403 with the console's own sentence. `console_audit` re-checks
 * `console.require_role('admin')` itself regardless, and that -- not this line -- is the boundary.
 *
 * The query string is read off `req.url`, which is safe and is not the thing
 * src/app/console/api/team/route.ts warns about: the rule there is that a *member-facing link* must
 * never be assembled from client input, because the proxy rewrites every request. Reading the
 * filters a client sent is the one thing `req.url` is for, and every value is narrowed by
 * `parseAuditFilters` before it reaches the database.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    await requireConsoleMember("admin");
    const filters = parseAuditFilters(Object.fromEntries(new URL(req.url).searchParams), consoleEnvironment());
    const { rows, total } = await getAuditLog(auditQueryFor(filters, new Date()));
    return jsonOk({ ok: true, rows, total });
  } catch (err) {
    return jsonError(err);
  }
}
