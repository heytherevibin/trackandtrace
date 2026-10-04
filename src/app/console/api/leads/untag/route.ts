import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { untagLead } from "@/console/leads/leads";
import { tagBody } from "@/console/leads/routes";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/untag — remove a tag from one lead. `console_untag_lead` re-checks the Support
 * floor and records the removal when there was something to remove. The answer is what is left.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("support");
    const input = await readBody(req, tagBody);
    const tags = await untagLead(await createConsoleDb(), consoleEnvironment(), input.id, input.tag);
    return jsonOk({ ok: true, tags });
  } catch (err) {
    return jsonError(err);
  }
}
