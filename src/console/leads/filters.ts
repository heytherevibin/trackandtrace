import type { Route } from "next";
import { consoleHref } from "@/console/href";

// What the Leads page's address carries: five filters, the page, and the open lead's id. Never an
// email. A searched address goes in a request body (leads-client.ts) and is held in the open page;
// an address in a URL sits in browser history, proxy logs and referrers for good.

export const NEWS_STATUSES = ["pending", "subscribed", "unsubscribed", "suppressed", "none"] as const;
export type NewsStatus = (typeof NEWS_STATUSES)[number];
export const ACCOUNT_STATUSES = ["none", "has", "disabled"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export const LEAD_SOURCES = ["footer", "landing", "pre-booking", "account", "added by hand"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const SEEN_RANGES = ["7d", "30d", "90d"] as const;
export type SeenRange = (typeof SEEN_RANGES)[number] | "any";

/** One page. `console_leads` clamps its limit to 200; this asks for 50. */
export const LEAD_PAGE_SIZE = 50;

/** A tag: letters, numbers and hyphens, 24 at most, a hyphen never first or last (the table's own rule). */
export const LEAD_TAG = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/;
/** How many tags one lead may carry. `console_tag_lead` refuses an eleventh. */
export const LEAD_TAGS_MAX = 10;
/** A note, as typed. `console_note_lead` refuses a longer one. */
export const LEAD_NOTE_MAX = 500;

/** `p:` a sign-up's id, `a:` an account's (20261005090000_console_leads.sql). Opaque, and safe in an address. */
export const LEAD_ID = /^[pa]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface LeadFilters {
  readonly news: NewsStatus | null;
  readonly account: AccountStatus | null;
  readonly source: LeadSource | null;
  /** Free-form, so any well-formed tag is a filter: one nobody carries matches nobody. */
  readonly tag: string | null;
  readonly seen: SeenRange;
  readonly page: number;
  /** The lead whose record is open, or null. */
  readonly lead: string | null;
}

/** No filter on, the first page, no record open: the plain page. */
export const NO_LEAD_FILTERS: LeadFilters = { news: null, account: null, source: null, tag: null, seen: "any", page: 1, lead: null };

export type LeadSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const one = (params: LeadSearchParams, key: string): string | null => {
  const value = params[key];
  const first = typeof value === "string" ? value : value?.[0];
  return first === undefined ? null : first;
};

function among<T extends string>(values: readonly T[], value: string | null): T | null {
  return values.find((v) => v === value) ?? null;
}

/** Anything unrecognised falls back to "all": a typed or stale address never becomes an error page. */
export function parseLeadFilters(params: LeadSearchParams): LeadFilters {
  const page = Number(one(params, "page"));
  const lead = one(params, "lead");
  const tag = one(params, "tag");
  return {
    news: among(NEWS_STATUSES, one(params, "news")),
    account: among(ACCOUNT_STATUSES, one(params, "account")),
    source: among(LEAD_SOURCES, one(params, "source")),
    tag: tag !== null && LEAD_TAG.test(tag) ? tag : null,
    seen: among(SEEN_RANGES, one(params, "seen")) ?? "any",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    lead: lead !== null && LEAD_ID.test(lead) ? lead : null,
  };
}

/** The page's address for these filters. Only what differs from the defaults is written. */
export function leadQuery(filters: LeadFilters): ReturnType<typeof consoleHref> {
  const query = new URLSearchParams();
  if (filters.news) query.set("news", filters.news);
  if (filters.account) query.set("account", filters.account);
  if (filters.source) query.set("source", filters.source);
  if (filters.tag) query.set("tag", filters.tag);
  if (filters.seen !== "any") query.set("seen", filters.seen);
  if (filters.page > 1) query.set("page", String(filters.page));
  if (filters.lead) query.set("lead", filters.lead);
  const text = query.toString();
  return consoleHref(text ? `/leads?${text}` : "/leads");
}

const DAYS: Readonly<Record<Exclude<SeenRange, "any">, number>> = { "7d": 7, "30d": 30, "90d": 90 };

/** The moment First seen counts from, as the database takes it, or null for any time. */
export function sinceFor(seen: SeenRange, now: Date): string | null {
  return seen === "any" ? null : new Date(now.getTime() - DAYS[seen] * 24 * 60 * 60 * 1000).toISOString();
}

export const hasFilters = (filters: LeadFilters): boolean => filters.news !== null || filters.account !== null || filters.source !== null || filters.tag !== null || filters.seen !== "any";

/**
 * A page's address with one lead's record open over it: `/leads?news=pending` becomes
 * `/leads?news=pending&lead=…`, and `/leads/pipeline` becomes `/leads/pipeline?lead=…`. The id is
 * opaque (`LEAD_ID`), so it is safe there; an address never is.
 */
export function leadRecordHref(page: Route, leadId: string): Route {
  return `${page}${page.includes("?") ? "&" : "?"}lead=${encodeURIComponent(leadId)}` as Route;
}
