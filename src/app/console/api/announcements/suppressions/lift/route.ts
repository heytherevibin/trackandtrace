import { liftSuppression } from "@/console/announcements/suppressions";
import { liftBody } from "@/console/announcements/routes";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/announcements/suppressions/lift — ends a suppression, so mail to the address resumes at
 * the next send. `console_lift_suppression` re-checks the Admin floor, refuses a caller who does not
 * name the row's own address, and writes the audit row in the same transaction as the delete.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const { id, address } = await readBody(req, liftBody);
    await liftSuppression(await createConsoleDb(), consoleEnvironment(), id, address);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
