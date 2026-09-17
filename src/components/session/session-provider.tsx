"use client";

import { createContext, use, useContext, type ReactNode } from "react";
import type { SessionUser } from "@/types/session";

// The root layout passes the user as an un-awaited promise so the shell keeps
// streaming and loading.tsx boundaries still show. Consumers suspend on it.

const SessionContext = createContext<Promise<SessionUser | null> | null>(null);

export function SessionProvider({ userPromise, children }: { readonly userPromise: Promise<SessionUser | null>; readonly children: ReactNode }) {
  return <SessionContext.Provider value={userPromise}>{children}</SessionContext.Provider>;
}

/** The signed-in user or null. Suspends until the promise settles; render inside a Suspense boundary. */
export function useUser(): SessionUser | null {
  const promise = useContext(SessionContext);
  if (!promise) return null;
  return use(promise);
}
