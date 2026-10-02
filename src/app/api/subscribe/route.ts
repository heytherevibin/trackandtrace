import { randomBytes } from "node:crypto";
import { z } from "zod";
import { messages } from "@/messages";
import { jsonError, jsonOk } from "@/services/api-response";
import { takeConfirmation } from "@/services/email/allowance";
import { sendToAddress } from "@/services/email/suppression";
import { env } from "@/services/env";
import { clientIp } from "@/services/rate-limit";
import { readBody } from "@/services/request-body";
import { createRateLimiter, publicStoreForReading } from "@/services/shared-store";
import { travellerOrigin } from "@/services/subscriptions/links";
import { signUpRow } from "@/services/subscriptions/store";
import { subscribe } from "@/services/subscriptions/subscribe";

export const dynamic = "force-dynamic";

/**
 * Made once per process, as `pnr-query` makes its own.
 *
 * Without a shared store `createRateLimiter` falls back to an in-memory one, and a fresh instance
 * per request counts every sign-up as the first — so the limit would be no limit at all on a
 * deployment with no Upstash. That is the one control standing between the forms and the daily
 * email allowance, so it cannot depend on Upstash being configured.
 */
let limiter: ReturnType<typeof createRateLimiter> | null = null;

const body = z
  .object({
    email: z.string().max(320),
    list: z.enum(["news", "availability"]),
    source: z.enum(["footer", "landing", "pre-booking", "account"]),
    campaign: z
      .object({ source: z.string().max(100), medium: z.string().max(100), name: z.string().max(100), page: z.string().max(200) })
      .partial()
      .strict()
      .optional(),
  })
  .strict();

/**
 * POST /api/subscribe — one sign-up.
 *
 * The same reply whether or not the address was known, so the form cannot be used to test whether
 * somebody is subscribed. The origin comes from `travellerOrigin`, never from `req.url`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const ask = await readBody(req, body);
    const current = env();
    const { kv, prefix } = publicStoreForReading(current);
    limiter ??= createRateLimiter(current);
    await subscribe(ask, clientIp(null, req.headers.get("x-forwarded-for")), {
      limiter,
      allowance: () => takeConfirmation(kv, prefix, new Date()),
      signUp: signUpRow,
      send: (letter) => sendToAddress(letter, "transactional"),
      origin: travellerOrigin(req.headers.get("host"), current.VERCEL_ENV),
      from: current.SUBSCRIBE_EMAIL_FROM,
      token: () => randomBytes(32).toString("base64url"),
    });
    return jsonOk({ ok: true, message: messages.subscribe.sent });
  } catch (err) {
    return jsonError(err);
  }
}
