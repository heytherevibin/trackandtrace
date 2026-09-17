"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { SessionProvider } from "@/components/session/session-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ToastHost } from "@/components/ui/toast";
import type { SessionUser } from "@/types/session";

/** Marks the document once React is interactive; styles and tests key off it. */
function HydrationMarker(): null {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}

export function Providers({ userPromise, children }: { readonly userPromise: Promise<SessionUser | null>; readonly children: ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider userPromise={userPromise}>
        <LazyMotion features={domAnimation} strict>
          <MotionConfig reducedMotion="user">
            <HydrationMarker />
            {children}
            <ToastHost />
          </MotionConfig>
        </LazyMotion>
      </SessionProvider>
    </ThemeProvider>
  );
}
