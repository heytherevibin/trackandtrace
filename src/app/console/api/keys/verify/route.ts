import { z } from "zod";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { assertConsoleAvailable } from "@/console/availability";
import { completeRegistration, completeSignIn, completeTap } from "@/console/keys/ceremony";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

// The ceremony response is the library's own JSON shape: checked here only far enough to be
// routed, then verified for real inside the WebAuthn boundary.
const ceremonyResponse = z.custom<Record<string, unknown> & { id: string }>(
  (value) => typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string",
  { message: consoleMessages.keys.didNotAnswer },
);

// "add_key" names two shapes, told apart by `step` -- z.discriminatedUnion needs one key whose
// literal value is distinct across every top-level branch, and two branches sharing intent:
// "add_key" both at the top level breaks that ("Duplicate discriminator value"). Nesting a second
// discriminated union under the add_key branch keeps the discriminator distinct at each level
// while still parsing `step` up front, before whichever of `name` or nothing else is expected.
const body = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("sign_in"), response: ceremonyResponse }).strict(),
  z.discriminatedUnion("step", [
    z.object({ intent: z.literal("add_key"), step: z.literal("tap"), response: ceremonyResponse }).strict(),
    z
      .object({
        intent: z.literal("add_key"),
        step: z.literal("register"),
        // console.keys checks 1..60 characters; refusing here keeps the database's own refusal for
        // the cases only it can see.
        name: z.string().trim().min(1).max(60),
        response: ceremonyResponse,
      })
      .strict(),
  ]),
]);

export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    const parsed = await readBody(req, body);

    if (parsed.intent === "sign_in") {
      await completeSignIn({ req, response: parsed.response as unknown as AuthenticationResponseJSON });
      return jsonOk({ ok: true, next: "/" });
    }
    if (parsed.step === "tap") {
      const { options } = await completeTap({ req, response: parsed.response as unknown as AuthenticationResponseJSON });
      return jsonOk({ ok: true, step: "register", options });
    }
    const { keyCount, activated } = await completeRegistration({
      req,
      response: parsed.response as unknown as RegistrationResponseJSON,
      name: parsed.name,
    });
    return jsonOk({ ok: true, keyCount, activated, next: activated ? "/" : null });
  } catch (err) {
    return jsonError(err);
  }
}
