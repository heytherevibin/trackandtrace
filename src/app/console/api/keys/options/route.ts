import { z } from "zod";
import { assertConsoleAvailable } from "@/console/availability";
import { beginCeremony } from "@/console/keys/ceremony";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

const body = z.object({ intent: z.enum(["sign_in", "add_key"]) }).strict();

/** Mints a challenge in the database and hands the browser the options that go with it (spec §D). */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const { intent } = await readBody(req, body);
    const { step, options } = await beginCeremony({ intent, req });
    return jsonOk({ ok: true, step, options });
  } catch (err) {
    return jsonError(err);
  }
}
