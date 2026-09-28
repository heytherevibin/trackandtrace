import { unblockAddress } from "@/console/abuse/blocks";
import { blockDeps, unblockBody } from "@/console/abuse/routes";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/** POST /api/abuse/unblock — follows a tap, in the same order as a block. */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const member = await requireConsoleMember("admin");
    const { member: target, reason } = await readBody(req, unblockBody);
    await unblockAddress({ member: target, reason, environment: consoleEnvironment(), actor: { userId: member.userId, name: member.name, role: member.role } }, await blockDeps());
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
