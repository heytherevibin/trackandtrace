"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { DismissRegular } from "@/components/icons";
import type { ReactNode } from "react";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { IconButton } from "./icon-button";

// A plate lifted off the panel, centred (modals do not scale from a trigger).

export const DialogRoot = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;

export function DialogContent({
  title,
  description,
  footer,
  size = "md",
  children,
  className,
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly footer?: ReactNode;
  readonly size?: "sm" | "md";
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-dialog bg-backdrop transition-opacity duration-(--duration-base) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
      <BaseDialog.Viewport className="fixed inset-0 z-dialog flex items-center justify-center p-4">
        <BaseDialog.Popup
          className={cn(
            "panel w-full bg-surface-3 shadow-3 outline-none",
            "transition-[transform,opacity] duration-(--duration-slow) ease-out data-[starting-style]:scale-96 data-[starting-style]:opacity-0 data-[ending-style]:scale-96 data-[ending-style]:opacity-0",
            size === "sm" ? "max-w-narrow" : "max-w-prose",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <BaseDialog.Title className="text-xl">{title}</BaseDialog.Title>
              {description ? <BaseDialog.Description className="mt-1 text-sm text-ink-2">{description}</BaseDialog.Description> : null}
            </div>
            <BaseDialog.Close render={<IconButton label={messages.common.close} icon={<DismissRegular className="size-5" aria-hidden="true" />} size="sm" />} />
          </div>
          {children ? <div className="p-4 sm:p-6">{children}</div> : null}
          {footer ? <div className="seam flex flex-wrap justify-end gap-2 px-4 py-3 sm:px-6">{footer}</div> : null}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  );
}
