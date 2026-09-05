"use client";

import { useEffect, useState } from "react";
import type { HistoryPoint, WatchlistEntry } from "./types";

// Local-first watchlist store. The shape mirrors the future repository so the
// account-synced layer (M3) swaps in behind the same read/write surface.

const KEY = "tt.watchlist.v1";

function readAll(): WatchlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchlistEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: WatchlistEntry[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Storage full / private mode — watchlist degrades to in-memory silently.
  }
}

export function getEntry(pnr: string): WatchlistEntry | undefined {
  return readAll().find((e) => e.pnr === pnr);
}

export function upsertEntry(pnr: string, label: string, point?: HistoryPoint): WatchlistEntry[] {
  const all = readAll();
  const existing = all.find((e) => e.pnr === pnr);
  if (existing) {
    if (point) {
      const last = existing.checks[existing.checks.length - 1];
      const sameHour =
        last && Math.abs(new Date(point.at).getTime() - new Date(last.at).getTime()) < 3_600_000;
      if (!sameHour) {
        existing.checks = [...existing.checks, point];
        if (existing.checks.length > 40) existing.checks = existing.checks.slice(-40);
      }
    }
  } else {
    all.push({ pnr, label, addedAt: new Date().toISOString(), checks: point ? [point] : [] });
  }
  writeAll(all);
  return all;
}

export function removeEntry(pnr: string): WatchlistEntry[] {
  const all = readAll().filter((e) => e.pnr !== pnr);
  writeAll(all);
  return all;
}

export function clearEntries(): WatchlistEntry[] {
  writeAll([]);
  return [];
}

/** React hook over the store — subscribes to changes across components. */
export function useWatchlist() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  useEffect(() => {
    setEntries(readAll());
    const onStorage = () => setEntries(readAll());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return {
    entries,
    upsert: (pnr: string, label: string, point?: HistoryPoint) =>
      setEntries(upsertEntry(pnr, label, point)),
    remove: (pnr: string) => setEntries(removeEntry(pnr)),
    clear: () => setEntries(clearEntries()),
  };
}
