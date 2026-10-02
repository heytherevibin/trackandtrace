import { z } from "zod";
import { messages } from "@/messages";
import { jsonError, jsonOk } from "@/services/api-response";
import { AppError } from "@/services/errors";
import { unsubscribeKey, verifyUnsubscribe } from "@/services/subscriptions/links";
import { withdrawRow } from "@/services/subscriptions/store";

export const dynamic = "force-dynamic";

// The same shapes /api/unsubscribe takes, read from the query because that is where the
// List-Unsubscribe header put them. The body is not read: RFC 8058 fixes it to
// "List-Unsubscribe=One-Click", which carries nothing, and a mail client's form encoding is not JSON.
const query = z.object({
  p: z.uuid(),
  l: z.enum(["news", "availability"]),
  s: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

/**
 * POST /api/unsubscribe/one-click — what `List-Unsubscribe-Post: List-Unsubscribe=One-Click` promises.
 *
 * A mail client POSTs here with no sign-in and no page, so the signed link is the whole permission.
 * The signature is checked before anything is written, so a link that does not verify touches
 * nothing. 200 on `done` and on `already` (and `unknown`, below): the client shows the reader whatever this returns, and
 * "you were already unsubscribed" is not a failure from where they stand.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) throw new AppError("INVALID_INPUT", messages.subscribe.errors.failed);
    const { p, l, s } = parsed.data;
    if (!verifyUnsubscribe(unsubscribeKey(), p, l, s)) throw new AppError("INVALID_INPUT", messages.subscribe.errors.failed);
    const state = await withdrawRow(p, l, null);
    // "unknown" (a signed link with no consent row behind it) answers 200 too, as /api/unsubscribe
    // does: the reader asked not to be mailed, and they are not, so an error button would be wrong.
    return jsonOk({ ok: true, state });
  } catch (err) {
    return jsonError(err);
  }
}
