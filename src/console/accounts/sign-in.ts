import type { AccountRow } from "@/console/accounts/accounts";
import { consoleMessages } from "@/console/messages";

const t = consoleMessages.accounts.table;

/** How an account signs in, as the sheet writes it: "Email link · Google · 2 passkeys". A dash for none. */
export function signInLine(account: Pick<AccountRow, "emailLink" | "google" | "passkeys">): string {
  const methods = [account.emailLink ? t.emailLink : null, account.google ? t.google : null, account.passkeys > 0 ? t.passkeys(account.passkeys) : null].filter((one): one is string => one !== null);
  return methods.length > 0 ? methods.join(" · ") : t.blank;
}
