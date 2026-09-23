import { z } from "zod";
import { assertConsoleAvailable } from "@/console/availability";
import { beginTap, tapReason } from "@/console/keys/tap";
import { TAP_ACTION_MAX, TAP_TARGET_MAX, TAP_VALUE_MAX } from "@/console/keys/tap-schema";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

// Every bound is imported from `@/console/keys/tap-schema`, never restated, and every one names a
// message a member can read. Both halves of that are a branch-review finding: `value` was 200 here
// and 2000 in the audit log's export route, so a 117-character search made an export impossible --
// and what TC-01 then showed was zod's own "Too big: expected string to have <=200 characters",
// since `consoleApiMessage` passes a real refusal through unchanged.
const tooLong = consoleMessages.tap.tooLong;

const body = z
  .object({
    action: z.string().min(1, tooLong).max(TAP_ACTION_MAX, tooLong),
    target: z.string().min(1, tooLong).max(TAP_TARGET_MAX, tooLong),
    value: z.string().max(TAP_VALUE_MAX, tooLong),
    // Spec §E: 10-200 characters. The sheet's own line is "Add a reason of at least 10 characters."
    reason: tapReason,
  })
  .strict();

/** Mints the challenge a per-action tap is bound to, and hands the browser the options that go with it (spec §D). */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const tap = await readBody(req, body);
    const { options } = await beginTap({ req, tap });
    return jsonOk({ ok: true, options });
  } catch (err) {
    return jsonError(err);
  }
}
