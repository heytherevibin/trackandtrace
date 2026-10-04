"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useState, type ReactNode } from "react";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
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
  phoneSheet = false,
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
  /**
   * Below `sm`, a sheet from the bottom edge with stacked full-width buttons, the action on top
   * (ConsoleAnnouncementsPhone.dc.html, Stop confirm). From `sm` up it is the centred dialog.
   */
  readonly phoneSheet?: boolean;
  readonly children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const pending = loading || busy;
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-dialog bg-backdrop transition-opacity duration-(--duration-base) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <AlertDialog.Viewport className={cn("fixed inset-0 z-dialog flex items-center justify-center p-4", phoneSheet && "max-sm:items-end max-sm:p-0")}>
          <AlertDialog.Popup
            className={cn(
              "blueprint w-full max-w-narrow bg-surface-3 p-6 shadow-3 outline-none transition-[transform,opacity] duration-(--duration-slow) ease-out data-[starting-style]:scale-98 data-[starting-style]:opacity-0 data-[ending-style]:scale-98 data-[ending-style]:opacity-0",
              // The phone board draws the sheet flush to the edges, with no registration marks.
              phoneSheet && "max-sm:max-w-none max-sm:border-b-0 max-sm:p-5 max-sm:[&>.corner]:hidden",
            )}
          >
            <Corners />
            <AlertDialog.Title className="text-3xl tracking-head">{title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2.5 text-body text-ink-2">{description}</AlertDialog.Description>
            {children ? <div className="mt-4">{children}</div> : null}
            {/* DOM order stays Cancel then confirm; reversed below `sm`, the action sits on top as drawn. */}
            <div className={cn("mt-6 flex flex-wrap justify-end gap-2", phoneSheet && "max-sm:flex-col-reverse max-sm:flex-nowrap max-sm:[&>button]:h-11 max-sm:[&>button]:w-full")}>
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
