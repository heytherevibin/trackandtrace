"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { messages } from "@/messages";

export function MergePrompt({ count, open, onMove, onDismiss }: { readonly count: number; readonly open: boolean; readonly onMove: () => Promise<void>; readonly onDismiss: (never: boolean) => void }) {
  const [never, setNever] = useState(false);
  const m = messages.watchlist.merge;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss(never);
      }}
      title={m.title(count)}
      description={m.detail}
      confirmLabel={m.move}
      cancelLabel={m.notNow}
      onConfirm={onMove}
    >
      <Switch checked={never} onCheckedChange={setNever} label={m.dontAsk} />
    </ConfirmDialog>
  );
}
