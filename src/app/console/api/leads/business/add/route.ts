import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { addBusinessLead } from "@/console/leads/business-leads";
import { businessAddBody } from "@/console/leads/routes";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/business/add — add a business lead by hand. No key: adding one is logged, not
 * guarded (the brief's table of safeguards). `console_add_business_lead` re-checks the Support
 * floor, scrubs what was typed, and records the act. An address that is already a lead is marked
 * rather than added twice. The answer names the lead and says which happened; it never carries
 * the address back.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("support");
    const input = await readBody(req, businessAddBody);
    const lead = await addBusinessLead(await createConsoleDb(), consoleEnvironment(), input);
    return jsonOk({ ok: true, id: lead.id, added: lead.added });
  } catch (err) {
    return jsonError(err);
  }
}
