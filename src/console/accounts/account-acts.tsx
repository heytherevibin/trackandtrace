"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import type { AccountDetail } from "@/console/accounts/accounts";
import { requestAccountAct } from "@/console/accounts/accounts-client";
import { ACCOUNT_ACTS, accountActValue, type AccountAct } from "@/console/accounts/acts";
import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { RecordSection } from "@/console/components/record-section";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.accounts.acts;

/**
 * The record's last two sections (ConsoleAccounts.dc.html: Record, Record: disabled, and the three
 * confirm states): Sign out everywhere, and Disable or Enable.
 *
 * EACH ACT IS BEHIND A REASON AND A KEY (TC-01). The tap is minted over this account's id and this
 * deployment, and `requestAccountAct` sends the same strings on: nothing between the two may
 * reshape them, or the database's re-digest would not match.
 *
 * WHAT IS OFFERED IS THE DRAWING OF THE RULE, NOT THE RULE. With nobody signed in there is no
 * button to sign out, and a disabled account is offered Enable in place of Disable; the database
 * refuses the same things itself, before it spends the member's key.
 *
 * `shown` is the account's address as the record shows it now: masked, or the revealed one.
 *
 * Not drawn on a phone: there, the record is read and nothing is changed.
 */
export function ActsSections({ account, shown, environment, onDone }: { readonly account: AccountDetail; readonly shown: string; readonly environment: string; readonly onDone: () => void }) {
  const [asking, setAsking] = useState<AccountAct | null>(null);
  const [reason, setReason] = useState("");
  const value = accountActValue(environment);

  const ask = (act: AccountAct) => {
    setReason("");
    setAsking(act);
  };

  async function confirmed(act: AccountAct): Promise<void> {
    const typed = reason;
    setAsking(null);
    const outcome = await requestAccountAct(act, account.id, value, typed);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return;
    }
    notify.success(m[act].done);
    onDone();
  }

  const toggle: AccountAct = account.disabled ? "enable" : "disable";
  const hints = { signOut: m.signOut.hint(account.sessions.count), disable: m.disable.hint, enable: m.enable.hint } as const satisfies Record<AccountAct, string>;

  return (
    <div className="max-sm:hidden">
      <RecordSection title={m.signOut.title}>
        {account.sessions.count > 0 ? (
          <>
            <p className="text-ink-2 text-label mb-3">{m.signOut.detail}</p>
            <Button onClick={() => ask("signOut")}>{m.signOut.action}</Button>
          </>
        ) : (
          <p className="text-ink-3 text-label">{m.signOut.nobody}</p>
        )}
      </RecordSection>
      <RecordSection title={m[toggle].title}>
        <p className="text-ink-2 text-label mb-3">{m[toggle].detail}</p>
        <Button onClick={() => ask(toggle)}>{m[toggle].action}</Button>
      </RecordSection>
      {/* One dialog, bound to whichever act was asked for; the last one asked for while it closes. */}
      <ConfirmItsYou
        open={asking !== null}
        action={ACCOUNT_ACTS[asking ?? toggle]}
        target={account.id}
        value={value}
        reason={reason}
        summary={m[asking ?? toggle].summary(shown)}
        hint={hints[asking ?? toggle]}
        onReasonChange={setReason}
        onCancel={() => setAsking(null)}
        onConfirmed={() => {
          if (asking !== null) void confirmed(asking);
        }}
      />
    </div>
  );
}
