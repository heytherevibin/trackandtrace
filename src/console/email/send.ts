import { env } from "@/services/env";
import { log } from "@/services/log";
import { outbox } from "./outbox";

export interface ConsoleLetter {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export type SendOutcome = "sent" | "captured" | "failed";

const RESEND_URL = "https://api.resend.com/emails";

/**
 * Console email, plain text, through Resend's API (spec §I). It never throws: spec §5 says a
 * sign-in answers the same whether Resend is up or down, and a Security alert that cannot be sent
 * is written to the audit log as Failed rather than breaking the action that caused it. The caller
 * decides what to do with the outcome.
 */
export async function sendConsoleEmail(letter: ConsoleLetter): Promise<SendOutcome> {
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
      log.warn("[console] no RESEND_API_KEY: console email is not configured for this deployment");
      return "failed";
    }
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${current.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: current.CONSOLE_EMAIL_FROM, to: [letter.to], subject: letter.subject, text: letter.text }),
    });
    if (response.ok) return "sent";
    log.warn("[console] resend refused a send", { status: response.status });
    return "failed";
  } catch (err) {
    log.warn("[console] could not send console email", err);
    return "failed";
  }
}
