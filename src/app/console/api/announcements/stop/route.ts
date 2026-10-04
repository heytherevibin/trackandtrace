import { stopLetter } from "@/console/announcements/letters";
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
 * POST /api/announcements/stop — halts the rest of an open letter. What has gone has gone. The send
 * job reads the letter's state before every recipient, so this takes effect at the next one.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const { id } = await readBody(req, letterBody);
    await stopLetter(await createConsoleDb(), consoleEnvironment(), id);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
