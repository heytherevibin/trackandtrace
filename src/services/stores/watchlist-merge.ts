import type { WatchlistEntry } from "@/types/domain";
import { readRaw, writeRaw } from "./local-storage";
import { mergeChecks } from "./watchlist-store";

// Moving device-only entries onto an account: what to create, what to update
// with checks the server lacks, and what is already identical.

export interface MergePlan {
  readonly create: readonly WatchlistEntry[];
  readonly update: readonly WatchlistEntry[];
  readonly unchanged: readonly string[];
}

export function planMerge(local: readonly WatchlistEntry[], server: readonly WatchlistEntry[]): MergePlan {
  const byPnr = new Map(server.map((e) => [e.pnr, e]));
  const create: WatchlistEntry[] = [];
  const update: WatchlistEntry[] = [];
  const unchanged: string[] = [];
  for (const entry of local) {
    const remote = byPnr.get(entry.pnr);
    if (!remote) {
      create.push(entry);
      continue;
    }
    const known = new Set(remote.checks.map((c) => c.at));
    const novel = entry.checks.some((c) => !known.has(c.at));
    if (novel) update.push({ ...remote, checks: mergeChecks(remote.checks, entry.checks) });
    else unchanged.push(entry.pnr);
  }
  return { create, update, unchanged };
}

export const MERGE_PROMPT_KEY = "tt.mergePrompt.v1";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type PromptState = { readonly never: true } | { readonly snoozedAt: string };

export function shouldPromptMerge(raw: unknown, now: Date): boolean {
  if (typeof raw !== "object" || raw === null) return true;
  const state = raw as Partial<PromptState>;
  if ("never" in state && state.never === true) return false;
  if ("snoozedAt" in state && typeof state.snoozedAt === "string") {
    return now.getTime() - Date.parse(state.snoozedAt) > SNOOZE_MS;
  }
  return true;
}

export const mergePromptStore = {
  shouldPrompt(now = new Date()): boolean {
    return typeof window !== "undefined" && shouldPromptMerge(readRaw(MERGE_PROMPT_KEY), now);
  },
  snooze(now = new Date()): void {
    writeRaw(MERGE_PROMPT_KEY, { snoozedAt: now.toISOString() });
  },
  never(): void {
    writeRaw(MERGE_PROMPT_KEY, { never: true });
  },
} as const;
