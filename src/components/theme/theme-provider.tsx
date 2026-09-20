"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";
import { THEME_STORAGE_KEY } from "./theme-boot";
import { ThemeColorSync } from "./theme-color-sync";

// No disableTransitionOnChange: it switches every transition off for a frame and snaps the press
// animation mid-release. ThemeToggle suppresses colour transitions itself during a switch
// (html[data-theme-switching], motion.css), leaving the press easing.
export function ThemeProvider({ nonce, children }: { readonly nonce?: string; readonly children: ReactNode }) {
  return (
    <NextThemes attribute="data-theme" defaultTheme="system" enableSystem enableColorScheme storageKey={THEME_STORAGE_KEY} nonce={nonce}>
      {children}
      <ThemeColorSync />
    </NextThemes>
  );
}
