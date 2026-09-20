"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import type { ReactNode } from "react";
import { HydrationMarker } from "@/components/hydration-marker";
import { SessionProvider } from "@/components/session/session-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ToastHost } from "@/components/ui/toast";
import type { SessionUser } from "@/types/session";

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
