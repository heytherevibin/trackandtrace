import type { WatchlistEntry } from "@/types/domain";
import { okSchema, watchlistApiItemSchema, watchlistApiListSchema, type WatchlistUpsert } from "@/types/schemas";
import { apiRequest, type ApiResult } from "./api-client";

// Browser calls to the account watchlist. Every response is validated.

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export async function listWatchlist(): Promise<ApiResult<WatchlistEntry[]>> {
  const out = await apiRequest("/api/watchlist", { method: "GET", cache: "no-store" }, watchlistApiListSchema);
  return out.ok ? { ok: true, data: out.data.data } : out;
}

export async function saveWatchlist(input: WatchlistUpsert): Promise<ApiResult<WatchlistEntry>> {
  const out = await apiRequest("/api/watchlist", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) }, watchlistApiItemSchema);
  return out.ok ? { ok: true, data: out.data.data } : out;
}

export async function deleteWatchlist(pnr: string): Promise<ApiResult<true>> {
  const out = await apiRequest("/api/watchlist", { method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify({ pnr }) }, okSchema);
  return out.ok ? { ok: true, data: true } : out;
}

export async function mergeWatchlist(entries: readonly WatchlistUpsert[]): Promise<ApiResult<WatchlistEntry[]>> {
  const out = await apiRequest("/api/watchlist/merge", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ entries }) }, watchlistApiListSchema);
  return out.ok ? { ok: true, data: out.data.data } : out;
}
