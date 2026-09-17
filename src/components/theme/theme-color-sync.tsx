"use client";

import { useLayoutEffect } from "react";
import { DARK, LIGHT } from "@/components/brand/brand-colors";
import { useTheme } from "./use-theme";

/** Keeps <meta name="theme-color"> honest when the user overrides the OS scheme. */
export function ThemeColorSync(): null {
  const { resolvedTheme } = useTheme();
  useLayoutEffect(() => {
    if (!resolvedTheme) return;
    const color = resolvedTheme === "dark" ? DARK.surface0 : LIGHT.surface0;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.setAttribute("content", color);
    }
  }, [resolvedTheme]);
  return null;
}
