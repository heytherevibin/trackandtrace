import { deleteLetter } from "@/console/announcements/letters";
import { letterBody } from "@/console/announcements/routes";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/announcements/delete — removes a draft. `console_delete_letter` re-checks the Admin
 * floor, refuses anything that has ever been queued (those are the record of who received what),
 * and writes the audit row in the same transaction as the delete.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const { id } = await readBody(req, letterBody);
    await deleteLetter(await createConsoleDb(), consoleEnvironment(), id);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
