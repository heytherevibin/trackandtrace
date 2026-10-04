import { saveLetter } from "@/console/announcements/letters";
import { saveBody } from "@/console/announcements/routes";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { assertConsoleAvailable } from "@/console/availability";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/announcements/save — a new draft, or a change to one. `console_save_letter` re-checks
 * the Admin floor, refuses anything but a draft, and clears the test when the text changed.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const { id, list, subject, body } = await readBody(req, saveBody);
    const saved = await saveLetter(await createConsoleDb(), id ? { id, list, subject, body } : { list, subject, body });
    return jsonOk({ ok: true, id: saved });
  } catch (err) {
    return jsonError(err);
  }
}
