import { z } from "zod";
import { jsonError, jsonOk } from "@/services/api-response";
import { recordWebhook } from "@/services/announcements/store";
import { env } from "@/services/env";
import { AppError } from "@/services/errors";
import { verifySvix } from "@/services/webhooks/svix";

export const dynamic = "force-dynamic";

// Resend's email events carry the recipients as `data.to`. Anything else about the event is none of
// this route's business: what an event MEANS is decided in one place, the `announce_webhook` function.
const NAMES_AN_ADDRESS = /^(email|suppression)\./;
const FAULT = "The webhook could not be processed.";

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

    // An event that is about an address must name one. Dropping it quietly would mean a complaint that
    // never suppresses anyone and never shows anywhere, so it is a fault: non-2xx, which Resend's
    // dashboard shows and retries. The TYPE is logged and nothing else; a type is not an address.
    // Event types we do not act on keep their quiet 200 below.
    const recipients = data?.to ?? [];
    if (recipients.length === 0) {
      if (NAMES_AN_ADDRESS.test(type)) {
        console.error(`[resend-webhook] a verified ${type} event named no recipient`);
        throw new AppError("INTERNAL", FAULT);
      }
      return jsonOk({ ok: true, state: "ignored" });
    }

    // One svix id covers the whole event, and the function deduplicates on it, so a second recipient
    // under the same id would be swallowed as a duplicate. Each gets its own, the first keeping the
    // plain id, so a single-recipient event (every email we send) is recorded under exactly Svix's.
    // The ids depend only on the svix id and the order of `to`, which Resend resends unchanged, so a
    // retry of the same event produces the same ids and is deduplicated rather than recorded twice.
    const results = await Promise.all(
      recipients.map((email, index) => recordWebhook(index === 0 ? head.id : `${head.id}#${index}`, type, email, at)),
    );
    return jsonOk({ ok: true, state: results.includes("recorded") ? "recorded" : "duplicate" });
  } catch (err) {
    // Only this route's own refusal (400) goes out as it is. Everything else, a store AppError
    // included, becomes one fixed 500: the store's message names a SQL function, and a thrown
    // message may name an address.
    return jsonError(err instanceof AppError && err.code === "INVALID_INPUT" ? err : new AppError("INTERNAL", FAULT));
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
