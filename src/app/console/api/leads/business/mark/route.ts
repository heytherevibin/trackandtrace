import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { markBusinessLead } from "@/console/leads/business-leads";
import { businessMarkBody } from "@/console/leads/routes";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/business/mark — put a lead that is already in the list into the pipeline, at
 * New. `console_mark_business_lead` re-checks the Support floor and records the act. The answer
 * is the lead's pipeline entry as stored.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("support");
    const input = await readBody(req, businessMarkBody);
    const { id, ...details } = input;
    const business = await markBusinessLead(await createConsoleDb(), consoleEnvironment(), id, details);
    return jsonOk({ ok: true, business });
  } catch (err) {
    return jsonError(err);
  }
}
