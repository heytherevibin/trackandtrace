import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { assertConsoleAvailable } from "@/console/availability";
import { verifyTap } from "@/console/keys/tap";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

// The ceremony response is the library's own JSON shape: checked here only far enough to be
// routed, then verified for real inside the WebAuthn boundary. Same shape keys/verify validates.
const ceremonyResponse = z.custom<Record<string, unknown> & { id: string }>(
  (value) => typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string",
  { message: consoleMessages.keys.didNotAnswer },
);

const body = z.object({ response: ceremonyResponse }).strict();

/** Verifies the tap's assertion and touches the key. The tap itself is spent later, by the action it approves. */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const { response } = await readBody(req, body);
    await verifyTap({ req, response: response as unknown as AuthenticationResponseJSON });
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
