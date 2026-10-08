import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { unmarkBusinessLead } from "@/console/leads/business-leads";
import { businessRemoveBody } from "@/console/leads/routes";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/business/remove — take a lead out of the pipeline. The lead stays, with its
 * tags and notes; its stage, its owner and what was typed about it go.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("support");
    const input = await readBody(req, businessRemoveBody);
    await unmarkBusinessLead(await createConsoleDb(), consoleEnvironment(), input.id);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
