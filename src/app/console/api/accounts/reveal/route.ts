import { revealAccount } from "@/console/accounts/accounts";
import { revealBody } from "@/console/accounts/routes";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/accounts/reveal — one account's address, whole. `console_reveal_account` re-checks
 * the Admin floor and writes the audit row; there is no reveal that is not recorded. `jsonOk`
 * answers `no-store`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const { id } = await readBody(req, revealBody);
    const address = await revealAccount(await createConsoleDb(), consoleEnvironment(), id);
    return jsonOk({ ok: true, address });
  } catch (err) {
    return jsonError(err);
  }
}
