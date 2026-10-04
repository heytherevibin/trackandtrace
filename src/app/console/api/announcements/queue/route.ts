import { queueLetter } from "@/console/announcements/letters";
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
 * POST /api/announcements/queue — fixes who gets the letter and hands it to the daily send.
 * `console_queue_letter` re-checks the Admin floor and every rule (a draft, a test made, a list
 * with someone on it, the Availability list unspent), and writes the audit row in the same
 * transaction.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const { id } = await readBody(req, letterBody);
    const people = await queueLetter(await createConsoleDb(), consoleEnvironment(), id);
    return jsonOk({ ok: true, people });
  } catch (err) {
    return jsonError(err);
  }
}
