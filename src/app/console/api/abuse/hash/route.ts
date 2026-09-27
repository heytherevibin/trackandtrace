import { z } from "zod";
import { requireConsoleMember } from "@/console/auth/guard";
import { assertConsoleAvailable } from "@/console/availability";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { AppError } from "@/services/errors";
import { UNREADABLE_ADDRESS, addressKey } from "@/services/rate-limit";
import { readBody } from "@/services/request-body";
import { addressMember } from "@/services/shared-store";
import { env } from "@/services/env";

export const dynamic = "force-dynamic";

const body = z.object({ address: z.string().trim().min(1).max(64) }).strict();

/**
 * POST /api/abuse/hash — an address in, the hash it is stored under out ("We hash it on entry and
 * never store it"). The block dialog calls this before the tap, so the tap is minted over the hash
 * and the address never reaches the audit log, the blocklist or a log line.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const { address } = await readBody(req, body);
    if (addressKey(address) === UNREADABLE_ADDRESS) throw new AppError("INVALID_INPUT", consoleMessages.abuse.errors.invalid);
    return jsonOk({ ok: true, member: addressMember(env(), address) });
  } catch (err) {
    return jsonError(err);
  }
}
