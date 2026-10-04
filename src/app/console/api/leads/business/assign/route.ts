import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { assignBusinessLead } from "@/console/leads/business-leads";
import { businessAssignBody } from "@/console/leads/routes";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/business/assign — give a business lead to another owner. The database refuses
 * anyone who is not an active member able to open Leads.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("support");
    const input = await readBody(req, businessAssignBody);
    const business = await assignBusinessLead(await createConsoleDb(), consoleEnvironment(), input.id, input.owner);
    return jsonOk({ ok: true, business });
  } catch (err) {
    return jsonError(err);
  }
}
