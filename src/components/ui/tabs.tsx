"use client";

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ComponentProps } from "react";
import { cn } from "@/utils/cn";

// The segmented control: hairline cells, the selected one tinted steel.

export const TabsRoot = BaseTabs.Root;
export const TabsPanel = BaseTabs.Panel;

export function TabsList({ className, children, ...rest }: ComponentProps<typeof BaseTabs.List>) {
  return (
    <BaseTabs.List className={cn("inline-flex border border-line", className)} {...rest}>
      {children}
    </BaseTabs.List>
  );
}

export function Tab({ className, ...rest }: ComponentProps<typeof BaseTabs.Tab>) {
  return (
    <BaseTabs.Tab
      className={cn(
        "press inline-flex h-8 items-center justify-center px-3 font-display text-2xs font-semibold uppercase tracking-caps text-ink-3 outline-none",
        "not-first:border-l not-first:border-line hover:bg-accent/12 data-[selected]:bg-accent/16 data-[selected]:text-accent-text",
        className,
      )}
      {...rest}
    />
  );
}
