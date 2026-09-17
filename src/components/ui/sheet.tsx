"use client";

import { Drawer } from "@base-ui/react/drawer";
import { DismissRegular } from "@/components/icons";
import type { ReactNode } from "react";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { IconButton } from "./icon-button";

// The bottom sheet: a tray that slides up from the panel edge and can be
// swiped back down. Base UI's Drawer supplies the gesture and its physics.

export const SheetRoot = Drawer.Root;
export const SheetTrigger = Drawer.Trigger;
export const SheetClose = Drawer.Close;

export function SheetContent({ title, description, children, className }: { readonly title: string; readonly description?: ReactNode; readonly children: ReactNode; readonly className?: string }) {
  return (
    <Drawer.Portal>
      <Drawer.Backdrop className="fixed inset-0 z-sheet bg-backdrop transition-opacity duration-(--duration-base) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
      <Drawer.Viewport className="fixed inset-0 z-sheet flex items-end justify-center">
        <Drawer.Popup
          className={cn(
            "panel flex max-h-[85dvh] w-full max-w-prose flex-col rounded-b-none border-b-0 bg-surface-3 pb-(--safe-bottom) shadow-3 outline-none",
            "transition-transform duration-(--duration-slow) ease-out-expo data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
            className,
          )}
        >
          <div className="flex justify-center pt-2" aria-hidden="true">
            <span className="h-1 w-12 rounded-full bg-line-strong" />
          </div>
          <div className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <Drawer.Title className="text-xl">{title}</Drawer.Title>
              {description ? <Drawer.Description className="mt-1 text-sm text-ink-2">{description}</Drawer.Description> : null}
            </div>
            <Drawer.Close render={<IconButton label={messages.common.close} icon={<DismissRegular className="size-5" aria-hidden="true" />} size="sm" />} />
          </div>
          <Drawer.Content className="overflow-y-auto px-4 pb-4">{children}</Drawer.Content>
        </Drawer.Popup>
      </Drawer.Viewport>
    </Drawer.Portal>
  );
}
