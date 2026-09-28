import { blockAddress } from "@/console/abuse/blocks";
import { blockBody, blockDeps } from "@/console/abuse/routes";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import type { BlockDuration } from "@/services/blocklist";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/abuse/block — follows a tap. `console_block_address` re-checks the Admin floor, spends
 * the tap and writes the Done row; only then is the block written to Upstash (blocks.ts says why).
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const member = await requireConsoleMember("admin");
    const { member: target, duration, note, reason } = await readBody(req, blockBody);
    const deps = await blockDeps();
    await blockAddress(
      {
        member: target,
        duration: duration as BlockDuration,
        note,
        reason,
        environment: consoleEnvironment(),
        actor: { userId: member.userId, name: member.name, role: member.role },
        keyId: deps.keyId,
        now: Date.now(),
      },
      deps,
    );
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
