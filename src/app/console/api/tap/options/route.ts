import { z } from "zod";
import { assertConsoleAvailable } from "@/console/availability";
import { beginTap, tapReason } from "@/console/keys/tap";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

const body = z
  .object({
    action: z.string().min(1).max(80),
    target: z.string().min(1).max(200),
    value: z.string().max(200),
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
