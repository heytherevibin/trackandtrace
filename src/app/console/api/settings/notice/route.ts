import { z } from "zod";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { tapReason } from "@/console/keys/tap";
import { assertSameOrigin } from "@/console/same-origin";
import { NOTICE_MAX, noticeChanges } from "@/console/settings/notice";
import { saveSettings } from "@/console/settings/save";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

// `.strict()`: the environment is the server's to decide, never a caller's. The text is bounded here
// as well as in `noticeChanges`, so a notice that is too long is a 400 naming the field.
const body = z
  .object({
    on: z.boolean(),
    text: z.string().max(NOTICE_MAX),
    /** The notice's version as the page read it; turning it on moves it on by one. */
    noticeVersion: z.number().int().min(1).nullable(),
    /** The settings row's version, which the save refuses on if it has moved on. */
    version: z.number().int().min(1),
    reason: tapReason,
  })
  .strict()
  .refine((b) => !b.on || b.text.trim() !== "", { message: "A notice needs its text.", path: ["text"] });

/**
 * POST /api/settings/notice — the Site notice row (Console Switches.dc.html). Follows a tap minted
 * over `settingsTap(environment, noticeChanges(...))`; the same `noticeChanges` builds the save here,
 * so what is written is what was approved. `console_save_settings` spends the tap, checks the version
 * and writes one audit row per changed field, in one transaction.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const { on, text, noticeVersion, version, reason } = await readBody(req, body);
    await saveSettings(noticeChanges({ on, text, current: noticeVersion }), version, reason, consoleEnvironment());
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
