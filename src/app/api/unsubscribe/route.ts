import { z } from "zod";
import { messages } from "@/messages";
import { jsonError, jsonOk } from "@/services/api-response";
import { AppError } from "@/services/errors";
import { readBody } from "@/services/request-body";
import { unsubscribeKey, verifyUnsubscribe } from "@/services/subscriptions/links";
import { rejoinRow, withdrawRow } from "@/services/subscriptions/store";

export const dynamic = "force-dynamic";

const body = z
  .object({
    p: z.uuid(),
    l: z.enum(["news", "availability"]),
    s: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    action: z.enum(["unsubscribe", "resubscribe", "reason"]),
    reason: z.enum(["too many", "not relevant", "did not sign up", "other"]).optional(),
  })
  .strict();

/**
 * POST /api/unsubscribe — the page's buttons.
 *
 * No sign-in: the signed link is the permission, which is what one-click unsubscribe requires. The
 * signature is checked before anything is written, so a link that does not verify touches nothing.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const { p, l, s, action, reason } = await readBody(req, body);
    if (!verifyUnsubscribe(unsubscribeKey(), p, l, s)) throw new AppError("INVALID_INPUT", messages.subscribe.errors.failed);
    const state = action === "resubscribe" ? await rejoinRow(p, l) : await withdrawRow(p, l, action === "reason" ? (reason ?? null) : null);
    return jsonOk({ ok: true, state });
  } catch (err) {
    return jsonError(err);
  }
}
