"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { notify } from "@/components/ui/toast";
import { requestStop } from "@/console/announcements/letters-client";
import { consoleMessages } from "@/console/messages";
import { formatCount } from "@/utils/datetime";

const m = consoleMessages.announcements;

/**
 * Stop, and "Stop sending?" (ConsoleAnnouncements.dc.html:303-315; a bottom sheet on a phone, where
 * this is the one action the console offers). A plain confirm, as drawn. The counts are the page's,
 * a moment old: the dialog's point is that what has gone cannot be recalled, not the exact number.
 *
 * The page is redrawn after a failure too. A stop is refused when the letter is no longer open —
 * it finished, or someone else stopped it — and the page should then show that.
 */
export function StopButton({ id, subject, sent, waiting }: { readonly id: string; readonly subject: string; readonly sent: number; readonly waiting: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function stop(): Promise<void> {
    const outcome = await requestStop(id);
    setOpen(false);
    if (outcome.kind === "done") notify.success(m.stopDialog.done);
    else notify.error(outcome.message);
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {m.detail.stop}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={m.stopDialog.title}
        before={<p className="text-body font-medium">{subject}</p>}
        description={m.stopDialog.detail(formatCount(sent), formatCount(waiting))}
        confirmLabel={m.stopDialog.confirm}
        tone="primary"
        phoneSheet
        onConfirm={stop}
      />
    </>
  );
}
