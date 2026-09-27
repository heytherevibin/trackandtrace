import type { AccountsState, StoreState } from "@/console/overview/overview";
import type { Kv } from "@/services/kv";

// Service now's two connection rows: each asks the cheapest question its service can answer. Neither
// throws — a status row that takes the page down with it is worse than one that says "not answering".

const PING_TIMEOUT_MS = 2000;

/**
 * One read of a key nobody writes. A missing key is still an answer; only a throw is not.
 *
 * `shared` is false when no shared store is configured, and then there is nothing to ask: the counts
 * live in this server's memory, which always answers, so "connected" would be true and misleading.
 */
export async function pingStore(store: { readonly kv: Kv; readonly prefix: string }, shared: boolean): Promise<StoreState> {
  if (!shared) return "local";
  try {
    await store.kv.get(`${store.prefix}:ping`);
    return "connected";
  } catch {
    return "unreachable";
  }
}

/**
 * The auth service's own health route, with the publishable key it is already public under. Accounts
 * are a traveller's sign-in, so it is the auth service that has to answer, not the database this
 * console just read its member from.
 */
export async function pingAccounts(
  config: { readonly url: string; readonly key: string } | null,
  fetcher: (input: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<AccountsState> {
  if (!config) return "notConfigured";
  try {
    const response = await fetcher(`${config.url}/auth/v1/health`, { headers: { apikey: config.key }, signal: AbortSignal.timeout(PING_TIMEOUT_MS), cache: "no-store" });
    return response.ok ? "connected" : "unreachable";
  } catch {
    return "unreachable";
  }
}
