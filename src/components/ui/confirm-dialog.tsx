"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useState, type ReactNode } from "react";
import { messages } from "@/messages";
import { Button } from "./button";

// For destructive, irreversible actions. No outside-click dismiss; the confirm
// key is the only way through, and it can be gated by an acknowledgement.

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
  readonly children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const pending = loading || busy;
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-dialog bg-backdrop transition-opacity duration-(--duration-base) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <AlertDialog.Viewport className="fixed inset-0 z-dialog flex items-center justify-center p-4">
          <AlertDialog.Popup className="panel w-full max-w-narrow bg-surface-3 p-6 shadow-3 outline-none transition-[transform,opacity] duration-(--duration-slow) ease-out data-[starting-style]:scale-96 data-[starting-style]:opacity-0 data-[ending-style]:scale-96 data-[ending-style]:opacity-0">
            <AlertDialog.Title className="text-xl">{title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-ink-2">{description}</AlertDialog.Description>
            {children ? <div className="mt-4">{children}</div> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <AlertDialog.Close render={<Button variant="secondary">{cancelLabel}</Button>} />
              <Button
                variant="danger"
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
