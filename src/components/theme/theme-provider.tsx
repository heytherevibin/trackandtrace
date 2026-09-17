"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";
import { THEME_STORAGE_KEY } from "./theme-boot";
import { ThemeColorSync } from "./theme-color-sync";

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  return (
    <NextThemes attribute="data-theme" defaultTheme="system" enableSystem enableColorScheme disableTransitionOnChange storageKey={THEME_STORAGE_KEY}>
      {children}
      <ThemeColorSync />
    </NextThemes>
  );
}
