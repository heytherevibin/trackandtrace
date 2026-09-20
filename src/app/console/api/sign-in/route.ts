import { after } from "next/server";
import { z } from "zod";
import { assertConsoleAvailable } from "@/console/availability";
import { sendSignInLink } from "@/console/auth/sign-in-link";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { assertSignInAllowed } from "@/console/sign-in-limits";
import { jsonError, jsonOk } from "@/services/api-response";
import { clientIp } from "@/services/rate-limit";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

const body = z.object({ email: z.email({ message: consoleMessages.signIn.invalid }).max(254) }).strict();

/**
 * Console sign-in (Form TC-02). One answer for every address, in content and in time: the lookup,
 * the mint and the send all run in `after()`, once this response is already on its way, so nothing
 * a caller can measure tells them whether the address belongs to a member.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const { email } = await readBody(req, body);
    const address = email.toLowerCase();
    await assertSignInAllowed(address, clientIp(null, req.headers.get("x-forwarded-for")));
    const host = req.headers.get("host") ?? new URL(req.url).host;
    after(() => sendSignInLink(address, host));
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
