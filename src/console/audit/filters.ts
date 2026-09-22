import { TIME_ZONE } from "@/utils/datetime";

// What a member can ask the audit log for, and how that question survives being written into an
// address and read back out of one. Pure: no database, no React, no next/headers -- the filter bar
// runs in the browser and the page and its GET route run on the server, and all three read this
// file. `audit.ts` may import from here; this file must never import from it.

/** The closed set `console.audit_result` holds. Compared as text in SQL and never cast, deliberately (task-1-report.md §5), so it is enforced here instead. */
export const AUDIT_RESULTS = ["done", "refused", "failed"] as const;
export type AuditResult = (typeof AUDIT_RESULTS)[number];

/**
 * The categories the Category picker offers. `console.audit_log.category` is free text with a
 * length check, not an enum -- these are the values this console writes (src/console/auth/audit.ts)
 * plus the `system` rows its own maintenance leaves behind, and a row carrying anything else still
 * parses and still shows.
 */
export const AUDIT_CATEGORIES = ["session", "team", "configure", "messages", "provider_keys", "leads", "record", "system"] as const;

export const AUDIT_RANGES = ["today", "7d", "30d", "custom"] as const;
export type AuditRange = (typeof AUDIT_RANGES)[number];

/**
 * One page. `console_audit` clamps p_limit to 200 and defaults to 50 (task-2-addendum.md §3);
 * asking for more silently gets 200, so this asks for exactly what the function already defaults to.
 */
export const AUDIT_PAGE_SIZE = 50;

/**
 * The token that says "every environment" in the address. An absent `env` is the default -- this
 * deployment's own -- so clearing the filter needs a word of its own rather than an empty value:
 * `consoleEnvironment()` is `VERCEL_ENV ?? NODE_ENV`, which is never "all".
 */
export const AUDIT_ENVIRONMENT_ALL = "all";

export interface AuditFilters {
  readonly range: AuditRange;
  /** An IST calendar day, `yyyy-mm-dd`, for the Custom range only. */
  readonly from: string | null;
  /** An IST calendar day, inclusive as the member picked it; the database is asked for the day after (see auditRangeBounds). */
  readonly to: string | null;
  readonly member: string | null;
  readonly category: string | null;
  readonly result: AuditResult | null;
  /** `null` means every environment. Defaults to this deployment's own (task-2-addendum.md §4). */
  readonly environment: string | null;
  /** Already trimmed; "" means no search. */
  readonly search: string;
  /** 1-based. */
  readonly page: number;
}

/** The nine arguments `console_audit` takes, with `null` for "no filter" throughout. */
export interface AuditQuery {
  readonly from: string | null;
  readonly to: string | null;
  readonly member: string | null;
  readonly category: string | null;
  readonly result: AuditResult | null;
  readonly search: string | null;
  readonly environment: string | null;
  readonly limit: number;
  readonly offset: number;
}

/** Next hands a page its searchParams in this shape; the GET route rebuilds it from the request's own URL. */
export type AuditSearchParams = Readonly<Record<string, string | string[] | undefined>>;

const KEYS = { range: "range", from: "from", to: "to", member: "member", category: "category", result: "result", environment: "env", search: "q", page: "page" } as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORY_MAX = 40;

function one(params: AuditSearchParams, key: string): string | null {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// Every range is an IST calendar day: the console's one clock is Asia/Kolkata (src/utils/datetime.ts),
// and "Today" has to mean the reader's own day, not UTC's -- at 02:00 IST the two disagree. IST has
// no daylight saving, so a fixed +05:30 is exact rather than approximately right. Midday is used
// for the arithmetic below so that adding whole days can never land on the wrong side of midnight.
const IST_OFFSET = "+05:30";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** The instant an IST calendar day begins, as the database wants it. */
function istDayStart(value: string): string {
  return new Date(`${value}T00:00:00${IST_OFFSET}`).toISOString();
}

/** The IST calendar day `count` days from this one. */
function shiftDay(value: string, count: number): string {
  return dayKey.format(new Date(`${value}T12:00:00${IST_OFFSET}`).getTime() + count * 86_400_000);
}

/** A day that is shaped like a day *and* is the day it claims to be: "2026-13-40" and "2026-02-31" both pass the regex and neither is a date. */
function day(value: string | null): string | null {
  if (!value || !DAY.test(value)) return null;
  const at = new Date(`${value}T12:00:00${IST_OFFSET}`);
  if (Number.isNaN(at.getTime())) return null;
  return dayKey.format(at) === value ? value : null;
}

export function defaultAuditFilters(environment: string): AuditFilters {
  return { range: "today", from: null, to: null, member: null, category: null, result: null, environment, search: "", page: 1 };
}

/**
 * The address, read. Nothing here refuses: a query string a member edited by hand, or one left over
 * from an older shape of this page, falls back to the default view rather than showing a refusal
 * for a filter. Every value is narrowed to something `console_audit` can be asked for -- which is
 * also what keeps a hand-made `result` from reaching the database, since SQL compares it as text
 * and would quietly match nothing.
 */
export function parseAuditFilters(params: AuditSearchParams, environment: string): AuditFilters {
  const fallback = defaultAuditFilters(environment);
  const rawRange = one(params, KEYS.range);
  const range = AUDIT_RANGES.find((r) => r === rawRange) ?? fallback.range;
  const rawResult = one(params, KEYS.result);
  const rawMember = one(params, KEYS.member);
  const rawCategory = one(params, KEYS.category)?.trim() ?? null;
  const rawEnvironment = one(params, KEYS.environment);
  const rawPage = Number(one(params, KEYS.page) ?? "1");

  return {
    range,
    // A day box only means anything for the Custom range; a stale from/to behind Today would
    // otherwise round-trip into an address that reads as filtered and is not.
    from: range === "custom" ? day(one(params, KEYS.from)) : null,
    to: range === "custom" ? day(one(params, KEYS.to)) : null,
    member: rawMember && UUID.test(rawMember) ? rawMember.toLowerCase() : null,
    category: rawCategory && rawCategory.length <= CATEGORY_MAX ? rawCategory : null,
    result: AUDIT_RESULTS.find((r) => r === rawResult) ?? null,
    environment: rawEnvironment === null ? fallback.environment : rawEnvironment === AUDIT_ENVIRONMENT_ALL ? null : rawEnvironment,
    search: one(params, KEYS.search)?.trim() ?? "",
    page: Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1,
  };
}

/**
 * The address, written -- and only what differs from the default view, so the page's own link stays
 * `/audit-log` until a member actually filters something.
 */
export function auditFiltersToQuery(filters: AuditFilters, environment: string): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.range !== "today") params.set(KEYS.range, filters.range);
  if (filters.range === "custom" && filters.from) params.set(KEYS.from, filters.from);
  if (filters.range === "custom" && filters.to) params.set(KEYS.to, filters.to);
  if (filters.member) params.set(KEYS.member, filters.member);
  if (filters.category) params.set(KEYS.category, filters.category);
  if (filters.result) params.set(KEYS.result, filters.result);
  if (filters.environment === null) params.set(KEYS.environment, AUDIT_ENVIRONMENT_ALL);
  else if (filters.environment !== environment) params.set(KEYS.environment, filters.environment);
  if (filters.search) params.set(KEYS.search, filters.search);
  if (filters.page > 1) params.set(KEYS.page, String(filters.page));
  return params;
}

/** The same, as a `?…` a link or a fetch can take -- and the empty string, not a bare "?", when nothing is filtered. */
export function auditFiltersToSearch(filters: AuditFilters, environment: string): string {
  const query = auditFiltersToQuery(filters, environment).toString();
  return query ? `?${query}` : "";
}

/**
 * Whether the chip row has anything to say. The date range is deliberately not counted: it always
 * has a value, it has its own control, and the sheet's own `hasActiveFilter` is drawn beside a
 * Category chip while Today is still selected (AuditLog.dc.html:354).
 */
export function hasActiveAuditFilters(filters: AuditFilters, environment: string): boolean {
  return Boolean(filters.member || filters.category || filters.result || filters.search) || filters.environment !== environment;
}

/** Clear filters, as the empty state's button and the filter bar's both mean it: back to the default view. */
export function clearAuditFilters(_filters: AuditFilters, environment: string): AuditFilters {
  return defaultAuditFilters(environment);
}

const SPAN: Readonly<Record<"today" | "7d" | "30d", number>> = { today: 1, "7d": 7, "30d": 30 };

/**
 * The half-open interval the range means: `from` inclusive, `to` **exclusive**, which is Task 1's
 * own contract (task-2-addendum.md §3) -- the start of the next day, never 23:59:59.999, so two
 * adjacent ranges partition a day instead of both claiming the row on the seam.
 *
 * "7 days" is today and the six before it, not the last 168 hours: the control sits beside "Today",
 * which is a calendar day, and a member asking for a week means seven of those.
 */
export function auditRangeBounds(filters: AuditFilters, now: Date): { readonly from: string | null; readonly to: string | null } {
  if (filters.range === "custom") {
    return {
      from: filters.from ? istDayStart(filters.from) : null,
      // The member picks an inclusive day; the database is asked for the morning after it.
      to: filters.to ? istDayStart(shiftDay(filters.to, 1)) : null,
    };
  }
  const today = dayKey.format(now);
  return { from: istDayStart(shiftDay(today, 1 - SPAN[filters.range])), to: istDayStart(shiftDay(today, 1)) };
}

/**
 * The filters as `console_audit`'s own nine arguments. `null` for everything absent and never `""`:
 * `p_category`, `p_result` and `p_environment` are plain equalities, so an empty string matches
 * nothing and shows an empty log with no explanation (task-2-addendum.md §3).
 */
export function auditQueryFor(filters: AuditFilters, now: Date): AuditQuery {
  const { from, to } = auditRangeBounds(filters, now);
  return {
    from,
    to,
    member: filters.member,
    category: filters.category,
    result: filters.result,
    search: filters.search || null,
    environment: filters.environment,
    limit: AUDIT_PAGE_SIZE,
    offset: (filters.page - 1) * AUDIT_PAGE_SIZE,
  };
}
