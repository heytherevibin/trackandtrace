import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { deleteLead } from "@/console/leads/leads";
import { deleteBody } from "@/console/leads/routes";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/delete — delete a lead that has no account. Behind a reason and a key: the
 * member tapped for exactly this id, value and reason, and `console_delete_lead` spends that tap by
 * re-digesting them, so they are passed through and never rebuilt here. The database refuses a
 * lead with an account, and refuses a value minted for another deployment, before the tap is spent.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("support");
    const input = await readBody(req, deleteBody);
    await deleteLead(await createConsoleDb(), consoleEnvironment(), input.id, input.value, input.reason);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
