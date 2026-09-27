"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { UNBLOCK_ACTION, shortMember, unblockTapValue } from "@/console/abuse/abuse";
import { requestUnblock } from "@/console/abuse/abuse-client";
import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.abuse;

/** A Blocked row's action: "Unblock, through Confirm it's you". */
export function UnblockButton({ environment, member }: { readonly environment: string; readonly member: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const hash = shortMember(member);

  async function onConfirmed(): Promise<void> {
    setOpen(false);
    const outcome = await requestUnblock({ member, reason });
    if (outcome.kind === "done") {
      notify.success(m.blocked.doneToast);
      router.refresh();
      return;
    }
    notify.error(outcome.message);
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        aria-label={m.blocked.unblock(hash)}
        onClick={() => {
          setReason("");
          setOpen(true);
        }}
      >
        {m.blocked.unblockShort}
      </Button>
      <ConfirmItsYou
        open={open}
        action={UNBLOCK_ACTION}
        target={member}
        value={unblockTapValue(environment)}
        reason={reason}
        summary={m.blocked.unblockSummary(hash)}
        hint={m.blocked.unblockHint}
        onReasonChange={setReason}
        onCancel={() => setOpen(false)}
        onConfirmed={() => void onConfirmed()}
      />
    </>
  );
}
