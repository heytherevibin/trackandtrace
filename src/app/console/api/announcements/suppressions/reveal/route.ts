import { revealSuppression } from "@/console/announcements/suppressions";
import { revealBody } from "@/console/announcements/routes";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/announcements/suppressions/reveal — one suppressed address, whole. A POST, though it
 * changes no suppression: it writes an audit row every time (`console_reveal_suppression`), and an
 * address must never sit in a URL or a cache. `jsonOk` answers `no-store`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const { id } = await readBody(req, revealBody);
    const address = await revealSuppression(await createConsoleDb(), consoleEnvironment(), id);
    return jsonOk({ ok: true, address });
  } catch (err) {
    return jsonError(err);
  }
}
