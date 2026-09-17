"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useSyncExternalStore } from "react";
import { DesktopFilled, WeatherMoonFilled, WeatherSunnyFilled } from "@/components/icons";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { useTheme, type ThemeChoice } from "./use-theme";

const subscribeNever = () => () => undefined;
const isClient = () => true;
const isServer = () => false;

const OPTIONS: readonly { value: ThemeChoice; label: string; Icon: typeof DesktopFilled }[] = [
  { value: "system", label: messages.shell.theme.system, Icon: DesktopFilled },
  { value: "light", label: messages.shell.theme.light, Icon: WeatherSunnyFilled },
  { value: "dark", label: messages.shell.theme.dark, Icon: WeatherMoonFilled },
];

/** Auto · Day · Night: three hairline cells, each an icon and an 11px capital legend, the chosen one tinted steel. */
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
      {OPTIONS.map(({ value, label, Icon }) => (
        <Toggle
          key={value}
          value={value}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 bg-transparent px-2.5 py-[5px] font-display text-2xs font-semibold uppercase leading-[normal] tracking-caps text-ink-1/70",
            "not-first:border-l not-first:border-line hover:bg-accent/12 data-[pressed]:bg-accent/16 data-[pressed]:text-accent-text",
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
