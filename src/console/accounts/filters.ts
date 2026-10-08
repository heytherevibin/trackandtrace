import { consoleHref } from "@/console/href";
import { SEEN_RANGES, type SeenRange } from "@/console/leads/filters";

// What the Accounts page's address carries: three filters, the page, and the open account's id.
// Never an email. A searched address goes in a request body (accounts-client.ts) and is held in
// the open page; an address in a URL sits in browser history, proxy logs and referrers for good.

export const ACCOUNT_STATES = ["active", "disabled"] as const;
export type AccountState = (typeof ACCOUNT_STATES)[number];
/** How an account can sign in. `console_accounts` takes exactly these. */
export const SIGN_IN_METHODS = ["email", "google", "passkey"] as const;
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];
/** Created within: the ranges First seen has in Leads, and counted the same way (`sinceFor`). */
export const CREATED_RANGES = SEEN_RANGES;
export type CreatedRange = SeenRange;

/** One page. `console_accounts` clamps its limit to 200; this asks for 50. */
export const ACCOUNT_PAGE_SIZE = 50;

/** An account's id: the auth service's own. Opaque, and safe in an address. */
export const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface AccountFilters {
  readonly status: AccountState | null;
  readonly method: SignInMethod | null;
  readonly created: CreatedRange;
  readonly page: number;
  /** The account whose record is open, or null. */
  readonly account: string | null;
}

/** No filter on, the first page, no record open: the plain page. */
export const NO_ACCOUNT_FILTERS: AccountFilters = { status: null, method: null, created: "any", page: 1, account: null };

export type AccountSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const one = (params: AccountSearchParams, key: string): string | null => {
  const value = params[key];
  const first = typeof value === "string" ? value : value?.[0];
  return first === undefined ? null : first;
};

function among<T extends string>(values: readonly T[], value: string | null): T | null {
  return values.find((v) => v === value) ?? null;
}

/** Anything unrecognised falls back to "all": a typed or stale address never becomes an error page. */
export function parseAccountFilters(params: AccountSearchParams): AccountFilters {
  const page = Number(one(params, "page"));
  const account = one(params, "account");
  return {
    status: among(ACCOUNT_STATES, one(params, "status")),
    method: among(SIGN_IN_METHODS, one(params, "method")),
    created: among(CREATED_RANGES, one(params, "created")) ?? "any",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    account: account !== null && ACCOUNT_ID.test(account) ? account : null,
  };
}

/** The page's address for these filters. Only what differs from the defaults is written. */
export function accountQuery(filters: AccountFilters): ReturnType<typeof consoleHref> {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.method) query.set("method", filters.method);
  if (filters.created !== "any") query.set("created", filters.created);
  if (filters.page > 1) query.set("page", String(filters.page));
  if (filters.account) query.set("account", filters.account);
  const text = query.toString();
  return consoleHref(text ? `/accounts?${text}` : "/accounts");
}

export const hasAccountFilters = (filters: AccountFilters): boolean => filters.status !== null || filters.method !== null || filters.created !== "any";
