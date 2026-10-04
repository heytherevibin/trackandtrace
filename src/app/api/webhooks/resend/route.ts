import { z } from "zod";
import { jsonError, jsonOk } from "@/services/api-response";
import { recordWebhook } from "@/services/announcements/store";
import { env } from "@/services/env";
import { AppError } from "@/services/errors";
import { verifySvix } from "@/services/webhooks/svix";

export const dynamic = "force-dynamic";

// Resend's email events carry the recipients as `data.to`, and some events name a single address as
// `data.email`. Either is read; anything else about the event is none of this route's business, since
// what an event MEANS is decided in one place, the `announce_webhook` function.
//
// ONLY `email.*` IS A FAULT WHEN NO ADDRESS IS FOUND. A `suppression.*` payload is a shape we have
// never actually seen. If Resend names the address there in some third way, treating it as a fault
// would make every such event answer non-2xx, Svix would retry it for ever, and **a persistently
// failing endpoint may be DISABLED by Resend — which would take `email.bounced` down with it**. A
// guess about a payload we have not seen must not be able to cost us bounce handling. So an
// unrecognised `suppression.*` takes the quiet 200 path and is logged by type instead.
const NAMES_AN_ADDRESS = /^email\./;
const A_SUPPRESSION = /^suppression\./;
const FAULT = "The webhook could not be processed.";

/**
 * An error this route made on purpose, as opposed to one thrown from beneath it. The catch tells the
 * two apart by this type and nothing else: a code or a message is a fact about some other module,
 * and a store error that happened to carry `INVALID_INPUT` would otherwise go out as a 400.
 */
class RouteError extends AppError {}

const event = z.object({
  type: z.string().min(1).max(100),
  data: z.object({ to: z.array(z.string().min(3).max(320)).max(50), email: z.string().min(3).max(320) }).partial().optional(),
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
    if (!secret) throw new RouteError("INTERNAL", "The webhook is not configured.");

    const raw = await req.text();
    const head = {
      id: req.headers.get("svix-id") ?? "",
      timestamp: req.headers.get("svix-timestamp") ?? "",
      signature: req.headers.get("svix-signature") ?? "",
    };
    if (!head.id || !verifySvix(secret, head, raw, new Date())) {
      throw new RouteError("INVALID_INPUT", "The webhook could not be verified.");
    }

    // Verified from here on, so the body is ours to read.
    const parsed = event.safeParse(parseJson(raw));
    if (!parsed.success) throw new RouteError("INVALID_INPUT", "The webhook body was not an event.");
    const { type, data } = parsed.data;

    // The verified svix timestamp, not a date from the body: it is the one date we know was inside the tolerance.
    const at = new Date(Number(head.timestamp) * 1000).toISOString();

    // An event that is about an address must name one. Dropping it quietly would mean a complaint that
    // never suppresses anyone and never shows anywhere, so it is a fault: non-2xx, which Resend's
    // dashboard shows and retries. The TYPE is logged and nothing else; a type is not an address.
    // Event types we do not act on keep their quiet 200 below.
    // `data.to` when it has entries, else a single `data.email`. Not `??`: an explicit empty `to`
    // must not shadow an address the event gave us under the other name.
    const recipients = data?.to && data.to.length > 0 ? data.to : data?.email ? [data.email] : [];
    if (recipients.length === 0) {
      if (NAMES_AN_ADDRESS.test(type)) {
        console.error(`[resend-webhook] a verified ${type} event named no recipient`);
        throw new RouteError("INTERNAL", FAULT);
      }
      // Not fatal, but not silent either: a suppression payload whose recipient field we do not
      // recognise would otherwise suppress nobody and leave no trace that it arrived. The TYPE is
      // logged and nothing else; a type is not an address.
      if (A_SUPPRESSION.test(type)) console.error(`[resend-webhook] a verified ${type} event named no recipient this route recognises, so nothing was recorded`);
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
    // The route's own refusals and faults go out as they are, each with its own status and message.
    if (err instanceof RouteError) return jsonError(err);
    // Everything else came from beneath: a store AppError names a SQL function and a thrown message
    // may name an address, so the caller gets one fixed 500 and the log gets one fixed line. The line
    // is what tells this 500 from the others in Resend's dashboard; it carries nothing from the event.
    console.error("[resend-webhook] recording the event failed");
    return jsonError(new AppError("INTERNAL", FAULT));
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
