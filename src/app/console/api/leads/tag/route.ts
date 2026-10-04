import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { tagLead } from "@/console/leads/leads";
import { tagBody } from "@/console/leads/routes";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/tag — add a tag to one lead. No key: tags are logged, not guarded (the brief's
 * table of safeguards). `console_tag_lead` re-checks the Support floor, holds the tag to its rule
 * and the lead to ten, and writes the audit row. The answer is the lead's tags as they now stand.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("support");
    const input = await readBody(req, tagBody);
    const tags = await tagLead(await createConsoleDb(), consoleEnvironment(), input.id, input.tag);
    return jsonOk({ ok: true, tags });
  } catch (err) {
    return jsonError(err);
  }
}
