"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { DesktopRegular, WeatherMoonRegular, WeatherSunnyRegular } from "@/components/icons";
import { useSyncExternalStore } from "react";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { useTheme, type ThemeChoice } from "./use-theme";

const subscribeNever = () => () => undefined;
const isClient = () => true;
const isServer = () => false;

const OPTIONS: readonly { value: ThemeChoice; label: string; Icon: typeof DesktopRegular }[] = [
  { value: "system", label: messages.shell.theme.system, Icon: DesktopRegular },
  { value: "light", label: messages.shell.theme.light, Icon: WeatherSunnyRegular },
  { value: "dark", label: messages.shell.theme.dark, Icon: WeatherMoonRegular },
];

/** Three keys: System, Day, Night. Renders a same-size placeholder until the stored choice is known. */
export function ThemeToggle({ className, showLabels = false }: { readonly className?: string; readonly showLabels?: boolean }) {
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
      className={cn("inline-flex rounded-md border border-line-strong bg-surface-sunken p-0.5 shadow-key-pressed", className)}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <Toggle
          key={value}
          value={value}
          aria-label={label}
          title={label}
          className={cn(
            "press inline-flex h-8 items-center gap-1.5 rounded-sm px-2 text-ink-2 transition-colors",
            "data-[pressed]:bg-surface-2 data-[pressed]:text-ink-1 data-[pressed]:shadow-1",
            showLabels ? "min-w-16 justify-center" : "min-w-8 justify-center sm:min-w-9",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {showLabels ? <span className="font-label text-xs font-semibold uppercase tracking-wide">{label}</span> : null}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
