import { z } from "zod";
import { assertConsoleAvailable } from "@/console/availability";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { redeemSetupToken } from "@/console/setup/redeem";
import { jsonError, jsonOk } from "@/services/api-response";
import { AppError } from "@/services/errors";
import { log } from "@/services/log";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

// console.create_first_owner_link mints encode(gen_random_bytes(32), 'hex') -- exactly 64 lowercase
// hex characters. A shorter or garbled value matches no row anyway, but this is the console's
// bootstrap credential, so its shape is checked before it is even hashed.
const body = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/, "Invalid request.") }).strict();

/**
 * A setup token, redeemed (Task 2b: of either kind). A first-Owner link is server to server: the
 * token out of the Supabase SQL editor is the whole credential, and opening it proves possession.
 * An invite instead sends a sign-in link to the address it was made for -- `redeemSetupToken`
 * tells the two apart and reports which one this call turned out to be. Nothing here may say
 * whether an address exists -- this endpoint is reachable only with a token the database is
 * holding, and an invite's two refusals (expired, withdrawn) both require that same possession.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const { token } = await readBody(req, body);
    const outcome = await redeemSetupToken({ token, req });
    // A refusal is an ordinary answer, not an anomaly, so it returns here rather than throwing
    // into the catch below -- the same reason confirm/route.ts's early returns for a bad link
    // never reach its own log.warn.
    if (!outcome.ok) {
      const message = outcome.reason === "withdrawn" ? consoleMessages.setup.withdrawn : consoleMessages.setup.expired;
      return jsonError(new AppError("INVALID_INPUT", message, { status: 400 }));
    }
    return jsonOk({ ok: true, kind: outcome.kind });
  } catch (err) {
    // Unlike the refusal above, anything that reaches here is unexpected -- this is the console's
    // bootstrap and its invite intake alike, so a 503 or a 403 should leave a trace.
    log.warn("[console] a setup token could not be redeemed", err);
    return jsonError(err);
  }
}
