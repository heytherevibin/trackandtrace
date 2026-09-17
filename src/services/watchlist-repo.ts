import type { WatchlistEntry } from "@/types/domain";
import { historyPointSchema, type WatchlistUpsert } from "@/types/schemas";
import type { Database } from "@/types/supabase";
import { AppError } from "./errors";
import type { Db } from "./supabase/server";

// Data access for the account watchlist. Every function takes the caller's
// cookie-bound client, so RLS applies on top of the explicit user filters here.

export type WatchlistRow = Database["public"]["Tables"]["watchlist_entries"]["Row"];

const TABLE = "watchlist_entries";

export function rowToEntry(row: WatchlistRow): WatchlistEntry {
  const checks = historyPointSchema.array().safeParse(row.checks);
  return { pnr: row.pnr, label: row.label, addedAt: row.created_at, checks: checks.success ? checks.data : [] };
}

export function fromPostgrestError(error: { readonly code?: string; readonly message: string }): AppError {
  switch (error.code) {
    case "23505":
      return new AppError("INVALID_INPUT", "That PNR is already on the watchlist.");
    case "PGRST116":
      return new AppError("NOT_FOUND", "No such watchlist entry.");
    case "42501":
      return new AppError("UNAUTHENTICATED", "You do not have access to that record.");
    default:
      return new AppError("INTERNAL", error.message);
  }
}

export async function listEntries(db: Db, userId: string): Promise<WatchlistEntry[]> {
  const { data, error } = await db.from(TABLE).select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw fromPostgrestError(error);
  return (data ?? []).map(rowToEntry);
}

export async function upsertEntry(db: Db, userId: string, input: WatchlistUpsert): Promise<WatchlistEntry> {
  const { data, error } = await db
    .from(TABLE)
    .upsert({ user_id: userId, pnr: input.pnr, label: input.label, checks: input.checks }, { onConflict: "user_id,pnr" })
    .select()
    .single();
  if (error) throw fromPostgrestError(error);
  return rowToEntry(data);
}

export async function deleteEntry(db: Db, userId: string, pnr: string): Promise<void> {
  const { error } = await db.from(TABLE).delete().eq("user_id", userId).eq("pnr", pnr);
  if (error) throw fromPostgrestError(error);
}

export async function deleteAllForUser(db: Db, userId: string): Promise<void> {
  const { error } = await db.from(TABLE).delete().eq("user_id", userId);
  if (error) throw fromPostgrestError(error);
}
