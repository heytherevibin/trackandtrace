"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { notify } from "@/components/ui/toast";
import { requestDelete } from "@/console/announcements/letters-client";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.announcements;

/**
 * A Draft row's one action: Delete, through a plain confirm. Not on the sheet — the owner asked for
 * it on 2026-10-04, when a test draft could not be removed, and chose the list's row as its place.
 *
 * Only a draft has it. Anything that has been queued is the record of who received what, and the
 * database refuses to delete it whatever this draws (console_delete_letter).
 *
 * The list is redrawn after a failure too: a delete is refused when the draft is no longer one
 * (someone queued it meanwhile) or no longer there, and the list should then show that.
 */
export function DeleteDraftButton({ id, subject }: { readonly id: string; readonly subject: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function remove(): Promise<void> {
    const outcome = await requestDelete(id);
    setOpen(false);
    if (outcome.kind === "done") notify.success(m.deleteDialog.done);
    else notify.error(outcome.message);
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" size="sm" aria-label={m.letters.deleteLabel(subject)} onClick={() => setOpen(true)}>
        {m.letters.delete}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={m.deleteDialog.title}
        before={<p className="text-body font-medium">{subject}</p>}
        description={m.deleteDialog.detail}
        confirmLabel={m.deleteDialog.confirm}
        tone="danger"
        onConfirm={remove}
      />
    </>
  );
}
