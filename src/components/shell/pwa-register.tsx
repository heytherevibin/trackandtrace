"use client";

import { useEffect } from "react";

/** Registers the service worker on production builds only. */
export function PwaRegister(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
