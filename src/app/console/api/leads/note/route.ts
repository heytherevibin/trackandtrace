import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { noteLead } from "@/console/leads/leads";
import { noteBody } from "@/console/leads/routes";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/note — add a note to one lead. `console_note_lead` re-checks the Support floor,
 * removes any address, PNR-like number or IP from the words before it stores them, and records
 * that a note was written (never what it said). The answer is the lead's notes AS STORED, so the
 * member sees what was kept rather than what they typed.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("support");
    const input = await readBody(req, noteBody);
    const notes = await noteLead(await createConsoleDb(), consoleEnvironment(), input.id, input.body);
    return jsonOk({ ok: true, notes });
  } catch (err) {
    return jsonError(err);
  }
}
