import { suppressionFor } from "@/services/announcements/store";
import { log } from "@/services/log";
import { sendEmail, type Letter, type SendResult } from "./send";

// The types ride along so a caller that only needs the shape of a letter or an outcome does not have
// to import from `./send`: the one-door contract test treats every import from there as a way round.
export type { Letter, SendResult };
export type { SendOutcome } from "./send";

/**
 * `list` is mail a person did not just ask for (an announcement, an availability alert).
 * `transactional` is mail they explicitly requested at that moment (a sign-up confirmation, a
 * sign-in link, an invitation).
 */
export type MailKind = "list" | "transactional";

const REFUSED: SendResult = { outcome: "failed" };

/**
 * The one door all outgoing mail goes through.
 *
 * A hard bounce suppresses `all` mail to the address, sign-in links included: the mailbox does not
 * exist, and sending more damages the sending domain. A complaint suppresses `list` mail only, so a
 * link someone explicitly asked for still arrives.
 *
 * It fails closed. `suppressionFor` throws when the database errors, and a send that cannot see the
 * suppression table is not sent: mailing a suppressed address is the worse mistake of the two.
 *
 * The address is normalised the way the stored side is (`lower(btrim(…))`, enforced there by a check
 * constraint); a suppression that does not match the address we send to is no suppression at all.
 *
 * Like `sendEmail`, it never throws. It logs nothing that names an address.
 */
export async function sendToAddress(letter: Letter, kind: MailKind, idempotencyKey?: string): Promise<SendResult> {
  let suppressed: "all" | "list" | null;
  try {
    suppressed = await suppressionFor(letter.to.trim().toLowerCase());
  } catch (err) {
    log.warn("[email] suppression could not be read; not sending", err instanceof Error ? err.name : "");
    return REFUSED;
  }
  if (suppressed === "all" || (suppressed === "list" && kind === "list")) return REFUSED;
  return sendEmail(letter, idempotencyKey);
}
