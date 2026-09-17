"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useSyncExternalStore } from "react";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { useTheme, type ThemeChoice } from "./use-theme";

const subscribeNever = () => () => undefined;
const isClient = () => true;
const isServer = () => false;

const OPTIONS: readonly { value: ThemeChoice; label: string }[] = [
  { value: "system", label: messages.shell.theme.system },
  { value: "light", label: messages.shell.theme.light },
  { value: "dark", label: messages.shell.theme.dark },
];

/** Auto · Day · Night, as the masthead draws it: three hairline cells, 11px capitals, the chosen one tinted steel. */
export function ThemeToggle({ className }: { readonly className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeNever, isClient, isServer);

  return (
    <ToggleGroup
      value={mounted ? [theme] : []}
      onValueChange={(next) => {
        const choice = next[0];
        if (choice === "light" || choice === "dark" || choice === "system") setTheme(choice);
      }}
      aria-label={messages.shell.theme.label}
      className={cn("inline-flex shrink-0 border border-line", className)}
    >
      {OPTIONS.map(({ value, label }) => (
        <Toggle
          key={value}
          value={value}
          className={cn(
            "cursor-pointer bg-transparent px-2.5 py-[5px] font-display text-2xs font-semibold uppercase leading-[normal] tracking-caps text-ink-1/70",
            "not-first:border-l not-first:border-line hover:bg-accent/12 data-[pressed]:bg-accent/16 data-[pressed]:text-accent-text",
          )}
        >
          {label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
