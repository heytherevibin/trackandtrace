"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/session/session-provider";
import { useWatchlist } from "@/services/stores/watchlist-store";
import { listWatchlist } from "@/services/watchlist-api";

/** The account's saved count, read once per page load: the shell outlives client navigation, so it is one request. */
let accountCount: Promise<number | null> | null = null;

function readAccountCount(): Promise<number | null> {
  accountCount ??= listWatchlist().then((out) => (out.ok ? out.data.length : null));
  return accountCount;
}

/**
 * How many PNRs are saved, for the masthead's and the tab bar's Watchlist count (v4): this device's when signed out,
 * the account's when signed in. Zero until known, and zero draws no count.
 */
export function useWatchCount(): number {
  const user = useUser();
  const local = useWatchlist().entries.length;
  const [account, setAccount] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return;
    let live = true;
    void readAccountCount().then((n) => {
      if (live) setAccount(n);
    });
    return () => {
      live = false;
    };
  }, [user]);
  return user ? (account ?? 0) : local;
}
