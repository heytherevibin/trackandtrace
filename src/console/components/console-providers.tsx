"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import type { ReactNode } from "react";
import { HydrationMarker } from "@/components/hydration-marker";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ToastHost } from "@/components/ui/toast";

/**
 * The console's client context: the shared theme (its boot script carries this request's nonce),
 * motion, and the toast host. No traveller session.
 *
 * ToastHost was missing until task-9 (task-9-addendum.md §1): the sheets had already drawn two
 * toasts -- ConsoleMyKeys.dc.html's own "Key removed · logged" and "Other sessions signed out ·
 * logged" -- with nowhere to mount, the same placement src/components/providers.tsx:19 already uses
 * for the traveller side. The console's own CSP (src/console/csp.ts) already keeps
 * `style-src 'unsafe-inline'` specifically for this: "the toast library injects a <style> without
 * one [a nonce]".
 */
export function ConsoleProviders({ nonce, children }: { readonly nonce: string | undefined; readonly children: ReactNode }) {
  return (
    <ThemeProvider nonce={nonce}>
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <HydrationMarker />
          {children}
          <ToastHost />
        </MotionConfig>
      </LazyMotion>
    </ThemeProvider>
  );
}
