"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import { ticketStatusSchema } from "@/types/schemas";
import { readRaw, subscribeKey, writeRaw } from "./local-storage";

// Recent checks on this device: the last few PNRs, newest first, for one-tap re-check.

export const RECENT_KEY = "tt.recent.v1";
export const RECENT_MAX = 8;

export const recentCheckSchema = z.object({
  pnr: z.string().regex(/^\d{10}$/),
  label: z.string().optional(),
  status: ticketStatusSchema.optional(),
  position: z.number().int().nullable().optional(),
  checkedAt: z.iso.datetime(),
});
export type RecentCheck = z.infer<typeof recentCheckSchema>;

const EMPTY: readonly RecentCheck[] = Object.freeze([]);

export function parseRecent(raw: unknown): readonly RecentCheck[] {
  if (!Array.isArray(raw)) return EMPTY;
  return raw.flatMap((item) => {
    const parsed = recentCheckSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function pushRecent(list: readonly RecentCheck[], item: RecentCheck, max = RECENT_MAX): readonly RecentCheck[] {
  return [item, ...list.filter((r) => r.pnr !== item.pnr)].slice(0, max);
}

let cache: readonly RecentCheck[] | null = null;
function read(): readonly RecentCheck[] {
  if (cache) return cache;
  cache = typeof window === "undefined" ? EMPTY : parseRecent(readRaw(RECENT_KEY));
  return cache;
}
function write(next: readonly RecentCheck[]): void {
  cache = next;
  writeRaw(RECENT_KEY, next);
}

export const recentStore = {
  get: read,
  subscribe(listener: () => void): () => void {
    return subscribeKey(RECENT_KEY, () => {
      cache = null;
      listener();
    });
  },
  push(item: RecentCheck): void {
    write(pushRecent(read(), item));
  },
  clear(): void {
    write(EMPTY);
  },
} as const;

const getServerSnapshot = () => EMPTY;

export function useRecentChecks(): { readonly recent: readonly RecentCheck[]; readonly clear: () => void } {
  const recent = useSyncExternalStore(recentStore.subscribe, recentStore.get, getServerSnapshot);
  return { recent, clear: recentStore.clear };
}
