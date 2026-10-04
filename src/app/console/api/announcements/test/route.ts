import { letterBody, testDeps, travellerOriginFor } from "@/console/announcements/routes";
import { sendTest } from "@/console/announcements/test-send";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { env } from "@/services/env";
import { AppError } from "@/services/errors";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/announcements/test — one real email of this draft, to the signed-in member's own
 * address and nobody else's: the body carries the letter's id and nothing more. test-send.ts says
 * why it sends first and records second.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const member = await requireConsoleMember("admin");
    const { id } = await readBody(req, letterBody);
    const origin = travellerOriginFor(req);
    if (!origin) throw new AppError("INVALID_INPUT", consoleMessages.announcements.errors.testFailed, { status: 502 });
    await sendTest({ id, to: member.email, from: env().SUBSCRIBE_EMAIL_FROM, origin, environment: consoleEnvironment() }, await testDeps());
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
