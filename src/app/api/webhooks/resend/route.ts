import { z } from "zod";
import { jsonError, jsonOk } from "@/services/api-response";
import { recordWebhook } from "@/services/announcements/store";
import { env } from "@/services/env";
import { AppError } from "@/services/errors";
import { verifySvix } from "@/services/webhooks/svix";

export const dynamic = "force-dynamic";

// Resend's email events carry the recipients as `data.to`. Anything else about the event is none of
// this route's business: what an event MEANS is decided in one place, the `announce_webhook` function.
const event = z.object({
  type: z.string().min(1).max(100),
  data: z.object({ to: z.array(z.string().min(3).max(320)).max(50) }).partial().optional(),
});

/**
 * POST /api/webhooks/resend: how a bounce or a complaint reaches the suppression table.
 *
 * Public and unauthenticated; the signature is the only thing that makes a request ours. Two rules
 * decide whether that holds, and a test for each:
 *
 * 1. **The body is read as raw text and verified as those exact bytes.** The signature covers what
 *    Resend sent. `await req.json()` and a `JSON.stringify` back would change key order and
 *    whitespace, so every real webhook would fail while a test using the same round trip passed.
 *    The text is parsed only after it verifies.
 * 2. **Nothing is recorded before it verifies.** A request that does not verify reaches no database
 *    call at all, and answers 400.
 *
 * A store failure answers 500 so Svix retries, which is safe: the function deduplicates on the svix
 * id, so a retry of a half-done event finishes it and a retry of a done one changes nothing. A
 * duplicate answers 200, because Svix has done its job and a retry would be wrong. Nothing here logs
 * an address, a signature or the body, and no response repeats one.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const secret = env().RESEND_WEBHOOK_SECRET;
    // Fail closed, and say so as a fault rather than a refusal: an unconfigured secret is ours to fix,
    // and Svix retrying until it is fixed is the right outcome.
    if (!secret) throw new AppError("INTERNAL", "The webhook is not configured.");

    const raw = await req.text();
    const head = {
      id: req.headers.get("svix-id") ?? "",
      timestamp: req.headers.get("svix-timestamp") ?? "",
      signature: req.headers.get("svix-signature") ?? "",
    };
    if (!head.id || !verifySvix(secret, head, raw, new Date())) {
      throw new AppError("INVALID_INPUT", "The webhook could not be verified.");
    }

    // Verified from here on, so the body is ours to read.
    const parsed = event.safeParse(parseJson(raw));
    if (!parsed.success) throw new AppError("INVALID_INPUT", "The webhook body was not an event.");
    const { type, data } = parsed.data;

    // The verified svix timestamp, not a date from the body: it is the one date we know was inside the tolerance.
    const at = new Date(Number(head.timestamp) * 1000).toISOString();

    // One svix id covers the whole event, and the function deduplicates on it, so a second recipient
    // under the same id would be swallowed as a duplicate. Each gets its own, the first keeping the
    // plain id, so a single-recipient event (every email we send) is recorded under exactly Svix's.
    const recipients = data?.to ?? [];
    const results = await Promise.all(
      recipients.map((email, index) => recordWebhook(index === 0 ? head.id : `${head.id}#${index}`, type, email, at)),
    );
    return jsonOk({ ok: true, state: recipients.length === 0 ? "ignored" : results.includes("recorded") ? "recorded" : "duplicate" });
  } catch (err) {
    // Whatever the store threw may name an address; the response and the log get a fixed sentence.
    return jsonError(err instanceof AppError ? err : new AppError("INTERNAL", "The event could not be recorded."));
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
