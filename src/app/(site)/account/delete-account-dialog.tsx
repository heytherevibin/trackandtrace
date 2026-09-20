"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { notify } from "@/components/ui/toast";
import { messages } from "@/messages";
import { apiRequest } from "@/services/api-client";
import { signOutEverywhere } from "@/services/auth-client";
import { okSchema } from "@/types/schemas";

export function DeleteAccountDialog({ open, onOpenChange }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void }) {
  const m = messages.account.data;
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={m.deleteTitle}
      description={m.deleteDetail}
      confirmLabel={m.deleteConfirm}
      confirmDisabled={!acknowledged}
      onConfirm={async () => {
        const out = await apiRequest("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) }, okSchema);
        if (!out.ok) {
          notify.error(m.deleteFailed, out.error.message);
          return;
        }
        notify.success(m.deleted);
        await signOutEverywhere();
        router.push("/");
        router.refresh();
      }}
    >
      <Switch checked={acknowledged} onCheckedChange={setAcknowledged} label={m.deleteAck} />
    </ConfirmDialog>
  );
}
