import { z } from "zod";
import { assertConsoleAvailable } from "@/console/availability";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { redeemSetupToken } from "@/console/setup/redeem";
import { jsonError, jsonOk } from "@/services/api-response";
import { AppError } from "@/services/errors";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

// The token is 32 random bytes as hex, straight out of console.create_first_owner_link's URL --
// hex-only, so a garbled value is refused here rather than hashed and sent to the database.
const body = z.object({ token: z.string().regex(/^[0-9a-f]+$/, "Invalid request.") }).strict();

/**
 * The first Owner's setup link, redeemed server to server: the token out of the Supabase SQL
 * editor is the whole credential, and opening it proves possession. Nothing here may say whether
 * an address exists -- this endpoint is reachable only with a token the database is holding.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const { token } = await readBody(req, body);
    const outcome = await redeemSetupToken({ token, req });
    if (!outcome.ok) throw new AppError("INVALID_INPUT", consoleMessages.setup.expired, { status: 400 });
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
