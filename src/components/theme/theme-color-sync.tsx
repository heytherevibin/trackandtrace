"use client";

import { useLayoutEffect } from "react";
import { DARK, LIGHT, NEUBRUTAL_DARK, NEUBRUTAL_LIGHT } from "@/components/brand/brand-colors";
import { useTheme } from "./use-theme";

/** Keeps <meta name="theme-color"> honest when the user overrides the OS scheme. */
export function ThemeColorSync(): null {
  const { resolvedTheme } = useTheme();
  useLayoutEffect(() => {
    if (!resolvedTheme) return;
    // The traveller site wears the Neubrutal face; the console keeps steel.
    const neubrutal = document.documentElement.dataset.face === "neubrutal";
    const color = neubrutal ? (resolvedTheme === "dark" ? NEUBRUTAL_DARK.bg : NEUBRUTAL_LIGHT.bg) : resolvedTheme === "dark" ? DARK.surface0 : LIGHT.surface0;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.setAttribute("content", color);
    }
  }, [resolvedTheme]);
  return null;
}
