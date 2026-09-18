"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useState, type ReactNode } from "react";
import { messages } from "@/messages";
import { Button } from "./button";
import { Corners } from "./corners";

// For destructive, irreversible actions. No outside-click dismiss; the confirm
// button is the only way through, and it can be gated by an acknowledgement.

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = messages.common.cancel,
  onConfirm,
  loading = false,
  confirmDisabled = false,
  tone = "danger",
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void | Promise<void>;
  readonly loading?: boolean;
  readonly confirmDisabled?: boolean;
  readonly tone?: "danger" | "primary";
  readonly children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const pending = loading || busy;
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-dialog bg-backdrop transition-opacity duration-(--duration-base) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <AlertDialog.Viewport className="fixed inset-0 z-dialog flex items-center justify-center p-4">
          <AlertDialog.Popup className="blueprint w-full max-w-narrow bg-surface-3 p-6 shadow-3 outline-none transition-[transform,opacity] duration-(--duration-slow) ease-out data-[starting-style]:scale-98 data-[starting-style]:opacity-0 data-[ending-style]:scale-98 data-[ending-style]:opacity-0">
            <Corners />
            <AlertDialog.Title className="text-3xl tracking-head">{title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2.5 text-body text-ink-2">{description}</AlertDialog.Description>
            {children ? <div className="mt-4">{children}</div> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <AlertDialog.Close render={<Button variant="secondary">{cancelLabel}</Button>} />
              <Button
                variant={tone}
                loading={pending}
                disabled={confirmDisabled}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onConfirm();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
