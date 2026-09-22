import { z } from "zod";
import { assertConsoleAvailable } from "@/console/availability";
import { beginCeremony } from "@/console/keys/ceremony";
import { consoleKeyKind } from "@/console/keys/kind";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

// Two shapes, not one with an optional field: adding a key registers a new credential and so names
// the kind of authenticator the member is about to present, while signing in picks among keys they
// already hold and has nothing to prefer. `.strict()` on both branches is what refuses a kind on a
// sign-in rather than silently ignoring it. The kind itself is parsed against the console's own
// closed set (@/console/keys/kind), never taken as sent: it is a browser's word about a browser.
const body = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("sign_in") }).strict(),
  z.object({ intent: z.literal("add_key"), kind: consoleKeyKind }).strict(),
]);

/** Mints a challenge in the database and hands the browser the options that go with it (spec §D). */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const parsed = await readBody(req, body);
    const { step, options } = await beginCeremony(
      parsed.intent === "add_key" ? { intent: "add_key", kind: parsed.kind, req } : { intent: "sign_in", req },
    );
    return jsonOk({ ok: true, step, options });
  } catch (err) {
    return jsonError(err);
  }
}
