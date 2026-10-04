import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { revealLead } from "@/console/leads/leads";
import { revealBody } from "@/console/leads/routes";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/reveal — one lead's address, whole. `console_reveal_lead` re-checks the Support
 * floor and writes the audit row; there is no reveal that is not recorded. `jsonOk` answers
 * `no-store`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("support");
    const { id } = await readBody(req, revealBody);
    const address = await revealLead(await createConsoleDb(), consoleEnvironment(), id);
    return jsonOk({ ok: true, address });
  } catch (err) {
    return jsonError(err);
  }
}
