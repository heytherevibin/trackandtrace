import { z } from "zod";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { assertConsoleAvailable } from "@/console/availability";
import { completeRegistration, completeSignIn, completeTap } from "@/console/keys/ceremony";
import { consoleKeyKind } from "@/console/keys/kind";
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
    // The tap step is what mints the registration options for every key after the first, so the
    // kind the member chose is named here, not only on the options route.
    z.object({ intent: z.literal("add_key"), step: z.literal("tap"), kind: consoleKeyKind, response: ceremonyResponse }).strict(),
    z
      .object({
        intent: z.literal("add_key"),
        step: z.literal("register"),
        // console.keys checks 1..60 characters; refusing here keeps the database's own refusal for
        // the cases only it can see.
        name: z.string().trim().min(1).max(60),
        response: ceremonyResponse,
        // No `kind` here, and `.strict()` refuses one that is sent anyway. The options are already
        // minted by this point, so a kind would change nothing about the ceremony -- the only thing
        // it could plausibly reach is console.keys' own type column, which is read off the
        // attestation that actually answered (verifyRegistration) and is never the client's to name.
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
      const { options } = await completeTap({ req, kind: parsed.kind, response: parsed.response as unknown as AuthenticationResponseJSON });
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
