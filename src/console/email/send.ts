import { sendEmail, type SendOutcome } from "@/services/email/send";
import { env } from "@/services/env";
import { log } from "@/services/log";

export type { SendOutcome };

export interface ConsoleLetter {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/**
 * Console email (spec §I). The sender itself is `@/services/email/send`, shared with the traveller
 * side, which cannot import `@/console/*`; this adds the one thing that is the console's own, its
 * From address.
 *
 * It still never throws, and `env()` is still read inside the try for the same reason the sender
 * does: a cold instance whose environment fails to parse throws from `env()` itself.
 */
export async function sendConsoleEmail(letter: ConsoleLetter): Promise<SendOutcome> {
  try {
    return await sendEmail({ from: env().CONSOLE_EMAIL_FROM, ...letter });
  } catch (err) {
    log.warn("[console] could not send console email", err);
    return "failed";
  }
}
