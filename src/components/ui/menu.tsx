"use client";

import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/utils/cn";

// A hairline list that grows from its trigger.

export const MenuRoot = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;

export function MenuContent({ children, align = "end", className }: { readonly children: ReactNode; readonly align?: "start" | "end"; readonly className?: string }) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner sideOffset={4} align={align} className="z-popover outline-none">
        <BaseMenu.Popup className={cn("popup-motion min-w-48 border border-line bg-surface-2 p-1 shadow-2 outline-none", className)}>{children}</BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

const ITEM = "flex cursor-default select-none items-center gap-2 px-3 py-2 text-sm text-ink-1 no-underline outline-none data-[highlighted]:bg-accent-wash data-[highlighted]:text-ink-1 data-[disabled]:opacity-45";

export function MenuItem({ className, ...rest }: ComponentProps<typeof BaseMenu.Item>) {
  return <BaseMenu.Item className={cn(ITEM, className)} {...rest} />;
}

export function MenuLinkItem({ className, ...rest }: ComponentProps<typeof BaseMenu.LinkItem>) {
  return <BaseMenu.LinkItem className={cn(ITEM, className)} {...rest} />;
}

export function MenuSeparator() {
  return <BaseMenu.Separator className="my-1 border-t border-line" />;
}

export function MenuLabel({ children }: { readonly children: ReactNode }) {
  return <BaseMenu.GroupLabel className="legend-sm px-3 py-1.5">{children}</BaseMenu.GroupLabel>;
}

export const MenuGroup = BaseMenu.Group;
