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

/** Auto · Day · Night as three hairline cells. No choice is pressed until the stored one is known. */
export function ThemeToggle({ className, size = "sm" }: { readonly className?: string; readonly size?: "sm" | "md" }) {
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
            "press inline-flex items-center justify-center font-display font-semibold uppercase tracking-caps text-ink-3",
            "not-first:border-l not-first:border-line hover:bg-accent/12 data-[pressed]:bg-accent/16 data-[pressed]:text-accent-text",
            size === "md" ? "h-9 px-3 text-label" : "h-8 px-2.5 text-2xs sm:h-7",
          )}
        >
          {label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
