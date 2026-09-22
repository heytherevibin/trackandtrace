import { z } from "zod";
import { exportAuditLog } from "@/console/audit/audit";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { tapReason } from "@/console/keys/tap";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

// The canonical half-open range: two ISO instants around one separator, either side possibly
// empty. Checked for shape only, and never reshaped -- this exact string is what
// console.action_digest hashed when the tap was minted, and console.use_tap re-hashes whatever
// reaches it. A `.trim()` or a re-serialisation here would be a second implementation of
// src/console/audit/filters.ts's canonical form, and every export would fail with "no tap for this
// action" the day the two drifted.
//
// The database refuses a malformed one too, in this module's own words; this is the cheaper
// boundary, and it keeps a shape complaint from arriving as something a member might read as being
// about their access.
const RANGE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)?\/(\d{4}-\d{2}-\d{2}T[\d:.]+Z)?$/;

// Long enough for five filters including a search box the member filled, and short enough that a
// hand-made body cannot make the database parse a megabyte of JSON.
//
// It is unreachable by typing, and that is now held rather than hoped: the search is the only
// free-text filter, `AUDIT_SEARCH_MAX` caps it at 200, and the other four are a uuid, a category of
// at most 40, an environment of at most 20 and one of three result labels -- so the canonical object
// cannot exceed about 350 characters. tests/unit/console/audit/export.test.ts pins that arithmetic,
// because the failure it prevents lands *after* a member has tapped their key.
const FILTERS_MAX = 2_000;

// Every constraint below names its own message. `readBody` puts a failed schema's own message in
// front of whoever sent it, and zod's are developer strings -- "Too big: expected string to have
// <=2000 characters" is what a member used to get for a search that was too long.
const m = consoleMessages.audit;

/**
 * Three fields, and deliberately no fourth.
 *
 * There is no `environment`: which deployment the audit row is written against is always the
 * server's to decide, never a caller's, exactly as on every other console writer. There is no
 * `count` either, though the dialog shows one -- the number of rows is what the database is about
 * to discover, and a caller asserting it would be asserting a fact it is not the one establishing.
 *
 * `tapReason` is imported rather than restated: it is the same schema `/api/tap/options` validated
 * the reason with at mint, and its trim decided the exact string `console.action_digest` hashed.
 * Imported from `@/console/keys/tap` and not `./tap-schema` because this route already runs
 * server-side (the split src/app/console/api/keys/mine/route.ts spells out).
 */
const exportBody = z
  .object({
    range: z.string().regex(RANGE, m.export.malformed),
    filters: z
      .string()
      .max(FILTERS_MAX, m.export.malformed)
      // An object, and only an object. `console_audit_export` reads its five filters off it with
      // `->>`, so a JSON array, string or null would read as "every filter absent" -- an export far
      // wider than the one the member confirmed, under a tap whose digest still matched.
      .refine(
        (value) => {
          try {
            const parsed: unknown = JSON.parse(value);
            return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
          } catch {
            return false;
          }
        },
        { message: m.export.malformed },
      ),
    reason: tapReason,
  })
  .strict();

/**
 * POST /api/audit/export -- one export of the audit log (Task 4, AuditLog.dc.html:90 and :232-251).
 *
 * **There is no GET beside this one, and that is the design.** The prepared export lives in the
 * one answer below and nowhere else: the CSV goes back in this response, the browser that asked
 * holds it as a Blob, and nothing is written to Redis, to Postgres or to disk. The sheet's own line
 * -- "Works once, in this browser, for 10 minutes" -- is then true by construction rather than by
 * bookkeeping, and the hazard the plan names ("a link that leaks is a copy of the console's whole
 * audit trail") does not exist, because there is no link. A download endpoint would have needed a
 * token, a store holding bulk personal data for ten minutes, and a single-use check with a race in
 * it; none of that is here to get wrong.
 *
 * **This route performs no part of the export itself.** `console_audit_export` spends the tap,
 * writes the audit row and reads the rows in one transaction -- `console.use_tap` re-digests the
 * four fields from its own arguments, so a route that spent a tap and then separately assembled a
 * CSV would have spent it on something nobody approved (task-4-addendum.md §2).
 *
 * `requireConsoleMember("admin")` carries the module's role floor here, as the GET beside it does
 * and for the same reason: a route has no frame to render the sheet's no-access state in.
 * `console_audit_export` re-checks `console.require_role('admin')` itself, and that -- not this
 * line -- is the boundary.
 *
 * Unlike the GET, this writes an audit row: an export reads personal data in bulk and is an action,
 * so it records itself. That row is written inside the function, beside the tap it spends, and is
 * the only write this phase's append-only constraint allows.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const { range, filters, reason } = await readBody(req, exportBody);
    const ready = await exportAuditLog({ range, filters, reason, environment: consoleEnvironment() });
    // jsonOk sets Cache-Control: no-store, which matters more here than anywhere else in the
    // console: this body is the audit log.
    return jsonOk({ ok: true, csv: ready.csv, count: ready.count, fileName: ready.fileName });
  } catch (err) {
    return jsonError(err);
  }
}
