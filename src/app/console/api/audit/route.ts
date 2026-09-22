import { z } from "zod";
import { getAuditEntry, getAuditLog } from "@/console/audit/audit";
import { auditQueryFor, parseAuditFilters } from "@/console/audit/filters";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { jsonError, jsonOk } from "@/services/api-response";

export const dynamic = "force-dynamic";

/**
 * `?id=` -- the drawer's one entry (Task 3), on this route rather than one of its own: the same
 * resource, the same role floor and the same "writes nothing" rule, and the brief's own file list
 * names this route and no other.
 *
 * Narrowed here because `console_audit_entry(p_id uuid)` is uuid-typed: PostgREST raises a raw
 * 22P02 "invalid input syntax for type uuid" on anything else, and that developer string would
 * reach a member unchanged. An id that is not a uuid is not a different answer either -- there is
 * no entry with it -- so it is answered as an id that is not there, the same way the database
 * answers one that merely does not exist.
 */
const entryId = z.guid();

/**
 * GET /api/audit -- one page of the audit log, filtered, or the one entry `?id=` names (above).
 * Unlike every other console GET so far,
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
    const params = new URL(req.url).searchParams;

    const asked = params.get("id");
    if (asked !== null) {
      // A 200 with a null entry, never a 404: `console_audit_entry` answers SQL NULL for an id
      // that is not there -- not an error and not a refusal (task-3-addendum.md §3) -- and a
      // status code would only make the client translate it back into the same sentence.
      const parsed = entryId.safeParse(asked);
      return jsonOk({ ok: true, entry: parsed.success ? await getAuditEntry(parsed.data) : null });
    }

    const filters = parseAuditFilters(Object.fromEntries(params), consoleEnvironment());
    const { rows, total } = await getAuditLog(auditQueryFor(filters, new Date()));
    return jsonOk({ ok: true, rows, total });
  } catch (err) {
    return jsonError(err);
  }
}
