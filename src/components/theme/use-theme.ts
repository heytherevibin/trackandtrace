"use client";

import { useTheme as useNextTheme } from "next-themes";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

function narrowChoice(value: string | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

/** Narrow wrapper so the rest of the app never depends on next-themes directly. */
export function useTheme(): { readonly theme: ThemeChoice; readonly resolvedTheme: ResolvedTheme | undefined; readonly setTheme: (next: ThemeChoice) => void } {
  const { theme, resolvedTheme, setTheme } = useNextTheme();
  return {
    theme: narrowChoice(theme),
    resolvedTheme: resolvedTheme === "light" || resolvedTheme === "dark" ? resolvedTheme : undefined,
    setTheme,
  };
}
