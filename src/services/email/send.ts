import { env } from "@/services/env";
import { log } from "@/services/log";
import { outbox } from "./outbox";

export interface Letter {
  /** The caller's, because the console and the traveller side send as different addresses. */
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** For the one-click unsubscribe headers a list email carries (07); a confirmation does not. */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * What a send came to. A `sent` carries the id Resend gave it, because a later bounce webhook names
 * the message by that id and nothing else ties it back to the recipient it was about.
 */
export type SendResult = { readonly outcome: "sent"; readonly id: string } | { readonly outcome: "captured" } | { readonly outcome: "failed" };

export type SendOutcome = SendResult["outcome"];

const FAILED: SendResult = { outcome: "failed" };

const RESEND_URL = "https://api.resend.com/emails";

/**
 * Plain-text email through Resend's API. It never throws: a sign-in answers the same whether Resend
 * is up or down, and a Security alert that cannot be sent is written to the audit log as Failed
 * rather than breaking the action that caused it. The caller decides what to do with the outcome.
 *
 * Under E2E (never in production) it goes to the outbox instead.
 *
 * `idempotencyKey` makes a retry safe: a timeout may have delivered, and Resend answers a repeat of
 * the same key with the first send's id instead of sending again. Resend remembers a key for 24
 * hours and accepts up to 256 characters, so the caller keeps its keys inside both.
 *
 * A 200 without an id is `failed`: a send that cannot be named is one a bounce can never be tied to.
 */
export async function sendEmail(letter: Letter, idempotencyKey?: string): Promise<SendResult> {
  // Everything, including env(), runs inside the try: a cold instance whose environment fails to
  // parse throws from env() itself, not only from fetch, and this function's one contract is that
  // it never rejects.
  try {
    const current = env();
    if (current.E2E) {
      outbox.put(letter);
      return { outcome: "captured" };
    }
    if (!current.RESEND_API_KEY) {
      log.warn("[email] no RESEND_API_KEY: email is not configured for this deployment");
      return FAILED;
    }
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${current.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: letter.from,
        to: [letter.to],
        subject: letter.subject,
        text: letter.text,
        ...(letter.headers ? { headers: letter.headers } : {}),
      }),
    });
    if (response.ok) {
      const id = await sentId(response);
      if (id) return { outcome: "sent", id };
      log.warn("[email] resend accepted a send but gave no id");
      return FAILED;
    }
    log.warn("[email] resend refused a send", { status: response.status });
    return FAILED;
  } catch (err) {
    log.warn("[email] could not send", err instanceof Error ? err.name : "");
    return FAILED;
  }
}

/** The id in Resend's reply, or null when the body is not JSON or carries none. */
async function sentId(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("id" in body)) return null;
    return typeof body.id === "string" && body.id !== "" ? body.id : null;
  } catch {
    return null;
  }
}
