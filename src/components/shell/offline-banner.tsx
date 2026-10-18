"use client";

import { useSyncExternalStore } from "react";
import { messages } from "@/messages";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
const offline = () => !navigator.onLine;
const never = () => false;

/** v4's offline strip: under the masthead, never over it — red, while the device has no connection. */
export function OfflineBanner() {
  const isOffline = useSyncExternalStore(subscribe, offline, never);
  if (!isOffline) return null;
  return (
    <div role="status" className="border-b-2 border-edge bg-red text-on-red">
      <p className="page-frame m-0 py-2 font-structure text-sm font-bold leading-5">{messages.shell.offline}</p>
    </div>
  );
}
