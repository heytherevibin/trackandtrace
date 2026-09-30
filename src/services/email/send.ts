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

export type SendOutcome = "sent" | "captured" | "failed";

const RESEND_URL = "https://api.resend.com/emails";

/**
 * Plain-text email through Resend's API. It never throws: a sign-in answers the same whether Resend
 * is up or down, and a Security alert that cannot be sent is written to the audit log as Failed
 * rather than breaking the action that caused it. The caller decides what to do with the outcome.
 *
 * Under E2E (never in production) it goes to the outbox instead.
 */
export async function sendEmail(letter: Letter): Promise<SendOutcome> {
  // Everything, including env(), runs inside the try: a cold instance whose environment fails to
  // parse throws from env() itself, not only from fetch, and this function's one contract is that
  // it never rejects.
  try {
    const current = env();
    if (current.E2E) {
      outbox.put(letter);
      return "captured";
    }
    if (!current.RESEND_API_KEY) {
      log.warn("[email] no RESEND_API_KEY: email is not configured for this deployment");
      return "failed";
    }
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${current.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: letter.from,
        to: [letter.to],
        subject: letter.subject,
        text: letter.text,
        ...(letter.headers ? { headers: letter.headers } : {}),
      }),
    });
    if (response.ok) return "sent";
    log.warn("[email] resend refused a send", { status: response.status });
    return "failed";
  } catch (err) {
    log.warn("[email] could not send", err instanceof Error ? err.name : "");
    return "failed";
  }
}
