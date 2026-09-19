import { z } from "zod";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { assertSignInAllowed } from "@/console/sign-in-limits";
import { jsonError, jsonOk } from "@/services/api-response";
import { clientIp } from "@/services/rate-limit";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

const body = z.object({ email: z.email({ message: consoleMessages.signIn.invalid }).max(254) }).strict();

/**
 * Console sign-in (Form TC-02). One answer for every address: nothing here says whether it belongs to a member.
 * Sending a link to members arrives in plan 2c, behind this same answer.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const { email } = await readBody(req, body);
    await assertSignInAllowed(email.toLowerCase(), clientIp(null, req.headers.get("x-forwarded-for")));
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
