"use client";

import { useSyncExternalStore } from "react";
import type { HistoryPoint, WatchlistEntry } from "@/types/domain";
import { watchlistEntrySchema } from "@/types/schemas";
import { readRaw, storageAvailable, subscribeKey, writeRaw } from "./local-storage";

// Device-only watchlist. Records exist only when the traveler saves them.
// Pure functions first; the store and hook are thin shells over them.

export const WATCHLIST_KEY = "tt.watchlist.v2";
const MAX_CHECKS = 40;
const EMPTY: readonly WatchlistEntry[] = Object.freeze([]);

export function parseEntries(raw: unknown): readonly WatchlistEntry[] {
  if (!Array.isArray(raw)) return EMPTY;
  return raw.flatMap((item) => {
    const parsed = watchlistEntrySchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function mergeChecks(existing: readonly HistoryPoint[], incoming: readonly HistoryPoint[], max = MAX_CHECKS): HistoryPoint[] {
  const byAt = new Map<string, HistoryPoint>();
  for (const point of [...existing, ...incoming]) byAt.set(point.at, point);
  return [...byAt.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-max);
}

export function upsertLocal(entries: readonly WatchlistEntry[], input: { readonly pnr: string; readonly label: string; readonly point?: HistoryPoint }, now = new Date()): readonly WatchlistEntry[] {
  const existing = entries.find((e) => e.pnr === input.pnr);
  const checks = mergeChecks(existing?.checks ?? [], input.point ? [input.point] : []);
  const entry: WatchlistEntry = { pnr: input.pnr, label: input.label, addedAt: existing?.addedAt ?? now.toISOString(), checks };
  return existing ? entries.map((e) => (e.pnr === input.pnr ? entry : e)) : [entry, ...entries];
}

export function appendCheckLocal(entries: readonly WatchlistEntry[], pnr: string, point: HistoryPoint): readonly WatchlistEntry[] {
  return entries.map((e) => (e.pnr === pnr ? { ...e, checks: mergeChecks(e.checks, [point]) } : e));
}

export function removeLocal(entries: readonly WatchlistEntry[], pnr: string): readonly WatchlistEntry[] {
  return entries.filter((e) => e.pnr !== pnr);
}

let cache: readonly WatchlistEntry[] | null = null;

function read(): readonly WatchlistEntry[] {
  if (cache) return cache;
  cache = typeof window === "undefined" ? EMPTY : parseEntries(readRaw(WATCHLIST_KEY));
  return cache;
}

function write(next: readonly WatchlistEntry[]): void {
  cache = next;
  writeRaw(WATCHLIST_KEY, next);
}

export const watchlistStore = {
  get: read,
  subscribe(listener: () => void): () => void {
    return subscribeKey(WATCHLIST_KEY, () => {
      cache = null;
      listener();
    });
  },
  upsert(pnr: string, label: string, point?: HistoryPoint): void {
    write(upsertLocal(read(), { pnr, label, point }));
  },
  appendCheck(pnr: string, point: HistoryPoint): void {
    write(appendCheckLocal(read(), pnr, point));
  },
  remove(pnr: string): void {
    write(removeLocal(read(), pnr));
  },
  clear(): void {
    write(EMPTY);
  },
  has(pnr: string): boolean {
    return read().some((e) => e.pnr === pnr);
  },
} as const;

const getServerSnapshot = () => EMPTY;

export function useWatchlist(): {
  readonly entries: WatchlistEntry[];
  readonly available: boolean;
  readonly remove: (pnr: string) => void;
  readonly clear: () => void;
  readonly upsert: (pnr: string, label: string, point?: HistoryPoint) => void;
} {
  const entries = useSyncExternalStore(watchlistStore.subscribe, watchlistStore.get, getServerSnapshot);
  const available = useSyncExternalStore(() => () => undefined, storageAvailable, () => true);
  return { entries: entries as WatchlistEntry[], available, remove: watchlistStore.remove, clear: watchlistStore.clear, upsert: watchlistStore.upsert };
}
