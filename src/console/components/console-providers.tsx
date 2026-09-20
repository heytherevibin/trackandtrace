"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import type { ReactNode } from "react";
import { HydrationMarker } from "@/components/hydration-marker";
import { ThemeProvider } from "@/components/theme/theme-provider";

/** The console's client context: the shared theme (its boot script carries this request's nonce) and motion. No traveller session. */
export function ConsoleProviders({ nonce, children }: { readonly nonce: string | undefined; readonly children: ReactNode }) {
  return (
    <ThemeProvider nonce={nonce}>
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <HydrationMarker />
          {children}
        </MotionConfig>
      </LazyMotion>
    </ThemeProvider>
  );
}
