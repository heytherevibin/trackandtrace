import { countSent } from "@/services/email/allowance";
import { sendEmail, type SendOutcome } from "@/services/email/send";
import { env } from "@/services/env";
import { log } from "@/services/log";
import { publicStoreForReading } from "@/services/shared-store";

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
    const outcome = await sendEmail({ from: env().CONSOLE_EMAIL_FROM, ...letter });
    // Counted, never gated. Console mail takes from the same daily allowance a sign-up confirmation
    // does, so a busy console leaves fewer confirmations — but an operator locked out because
    // travellers signed up would be the wrong failure, so nothing here can refuse a console letter.
    // Only a real send counts: a captured one under E2E never reached Resend.
    if (outcome === "sent") {
      const store = publicStoreForReading();
      await countSent(store.kv, store.prefix, new Date());
    }
    return outcome;
  } catch (err) {
    log.warn("[console] could not send console email", err);
    return "failed";
  }
}
