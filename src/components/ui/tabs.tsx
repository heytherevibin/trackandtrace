"use client";

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ComponentProps } from "react";
import { cn } from "@/utils/cn";

export const TabsRoot = BaseTabs.Root;
export const TabsPanel = BaseTabs.Panel;

export function TabsList({ className, children, ...rest }: ComponentProps<typeof BaseTabs.List>) {
  return (
    <BaseTabs.List className={cn("relative inline-flex rounded-md border border-line-strong bg-surface-sunken p-0.5 shadow-key-pressed", className)} {...rest}>
      {children}
      <BaseTabs.Indicator className="absolute bottom-0.5 left-0 top-0.5 z-0 w-(--active-tab-width) translate-x-(--active-tab-left) rounded-sm bg-surface-2 shadow-1 transition-[translate,width] duration-(--duration-base) ease-in-out" />
    </BaseTabs.List>
  );
}

export function Tab({ className, ...rest }: ComponentProps<typeof BaseTabs.Tab>) {
  return (
    <BaseTabs.Tab
      className={cn("press relative z-10 inline-flex h-8 items-center justify-center px-3 font-label text-xs font-semibold uppercase tracking-wide text-ink-2 outline-none data-[selected]:text-ink-1", className)}
      {...rest}
    />
  );
}
