import { z } from "zod";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { tapReason } from "@/console/keys/tap";
import { assertSameOrigin } from "@/console/same-origin";
import { saveSettings } from "@/console/settings/save";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

// `tapReason` imported rather than restated: it is the same schema /api/tap/options validated the
// reason with at mint, and its trim transform decided the exact string `console.action_digest`
// hashed. A second copy here would be a second answer to "what was signed".
//
// `.strict()` refuses anything else in the body, and `p_environment` in particular is the server's
// to decide, never a caller's — a browser that could name its own environment could edit
// production's settings from a preview deployment.
//
// The bounds are the column's own check constraint (1..1,000,000), restated so a number outside it
// is a 400 naming the field rather than a 500 carrying Postgres's words about a violated check.
const saveBody = z
  .object({
    liveChecksPerDay: z.number().int().min(1).max(1_000_000),
    /** What the page read. The save refuses if the row has moved on since. */
    version: z.number().int().min(1),
    reason: tapReason,
  })
  .strict();

/**
 * POST /api/settings — change the live-check limit (Console Switches.dc.html, PLATE "Limits").
 *
 * Follows a tap: ConfirmItsYou verifies the member first and only a completed tap reaches here.
 * `console_save_settings` re-verifies the Admin floor, the version and the tap's own digest, so
 * this handler adds no check of its own beyond the same-origin and shape validation every mutating
 * console route has.
 *
 * It also adds nothing after the save. The function writes its own audit row inside the same
 * transaction; writing one from here would be a second half of one action, outside the transaction
 * that makes it atomic.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const { liveChecksPerDay, version, reason } = await readBody(req, saveBody);
    await saveSettings({ live_checks_per_day: liveChecksPerDay }, version, reason, consoleEnvironment());
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
