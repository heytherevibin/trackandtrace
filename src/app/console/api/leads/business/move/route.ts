import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { moveBusinessLead } from "@/console/leads/business-leads";
import { businessMoveBody } from "@/console/leads/routes";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/business/move — move a business lead to another of the five stages.
 * `console_move_business_lead` records a move from one stage to another, and nothing for a move
 * to the stage it is in.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("support");
    const input = await readBody(req, businessMoveBody);
    const business = await moveBusinessLead(await createConsoleDb(), consoleEnvironment(), input.id, input.stage);
    return jsonOk({ ok: true, business });
  } catch (err) {
    return jsonError(err);
  }
}
