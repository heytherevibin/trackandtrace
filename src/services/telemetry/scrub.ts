import type { Breadcrumb, Event } from "@sentry/nextjs";
import { redact } from "@/services/log";

// Error reports say what went wrong, never who it happened to: no PNR, email,
// token, cookie, body, query string or URL fragment (the result page keeps the
// PNR in the fragment). This also runs in the browser, so it names no provider:
// tokens are recognised by their shape.

type Json = Record<string, unknown>;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const TOKEN = /[A-Za-z0-9_-]{24,}/g;
/** Any header named like a credential: authorization, cookies, and anything carrying a key, token or secret. */
const SENSITIVE_HEADER = /^(?:authorization|cookie|set-cookie)$|key|token|secret/i;
const DROPPED_REQUEST_FIELDS: ReadonlySet<string> = new Set(["cookies", "data", "query_string"]);
const DROPPED_USER_FIELDS: ReadonlySet<string> = new Set(["ip_address", "email", "username"]);
/** Ids Sentry needs to join events and spans; they are random, never personal. */
const IDS: ReadonlySet<string> = new Set(["trace_id", "span_id", "parent_span_id"]);
const URL_FIELDS: ReadonlySet<string> = new Set(["url", "from", "to", "http.url"]);

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

export function scrubText(text: string): string {
  return redact(text.replace(BEARER, "Bearer [token]").replace(EMAIL, "[email]").replace(TOKEN, "[token]"));
}

/** The URL without its query string or fragment. */
function pathOnly(url: string): string {
  return url.split(/[?#]/)[0] ?? "";
}

function deep(value: unknown): unknown {
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.map(deep);
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, IDS.has(k) ? v : field(k, v)]));
  return value;
}

function field(key: string, value: unknown): unknown {
  return typeof value === "string" && URL_FIELDS.has(key) ? scrubText(pathOnly(value)) : deep(value);
}

function without(object: Json, dropped: (key: string) => boolean): Json {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !dropped(key)));
}

const listed = (names: ReadonlySet<string>) => (key: string) => names.has(key.toLowerCase());

function scrubRequest(request: Json): Json {
  const kept = without(request, listed(DROPPED_REQUEST_FIELDS));
  return Object.fromEntries(
    Object.entries(kept).map(([key, value]) => [key, key === "headers" && isObject(value) ? deep(without(value, (key) => SENSITIVE_HEADER.test(key))) : field(key, value)]),
  );
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return {
    ...breadcrumb,
    ...(breadcrumb.message === undefined ? {} : { message: scrubText(breadcrumb.message) }),
    ...(breadcrumb.data === undefined ? {} : { data: deep(breadcrumb.data) as Json }),
  };
}

function scrubException(exception: Json): Json {
  const values = Array.isArray(exception.values) ? exception.values : [];
  return {
    ...exception,
    values: values.map((entry: unknown) => (isObject(entry) && typeof entry.value === "string" ? { ...entry, value: scrubText(entry.value) } : entry)),
  };
}

function scrubSpan(span: unknown): unknown {
  if (!isObject(span)) return span;
  return {
    ...span,
    ...(typeof span.description === "string" ? { description: scrubText(span.description) } : {}),
    ...(isObject(span.data) ? { data: deep(span.data) } : {}),
  };
}

/** Applied to every error and transaction before it leaves the process. */
export function scrubEvent<T extends Event>(event: T): T {
  const source: Json = Object.fromEntries(Object.entries(event));
  const scrubbed: Json = {
    ...source,
    ...(typeof source.message === "string" ? { message: scrubText(source.message) } : {}),
    ...(typeof source.transaction === "string" ? { transaction: scrubText(source.transaction) } : {}),
    ...(isObject(source.logentry) ? { logentry: deep(source.logentry) } : {}),
    ...(isObject(source.exception) ? { exception: scrubException(source.exception) } : {}),
    ...(Array.isArray(source.breadcrumbs) ? { breadcrumbs: source.breadcrumbs.map((b: Breadcrumb) => scrubBreadcrumb(b)) } : {}),
    ...(isObject(source.request) ? { request: scrubRequest(source.request) } : {}),
    ...(isObject(source.user) ? { user: deep(without(source.user, listed(DROPPED_USER_FIELDS))) } : {}),
    ...(isObject(source.extra) ? { extra: deep(source.extra) } : {}),
    ...(isObject(source.contexts) ? { contexts: deep(source.contexts) } : {}),
    ...(isObject(source.tags) ? { tags: deep(source.tags) } : {}),
    ...(Array.isArray(source.spans) ? { spans: source.spans.map(scrubSpan) } : {}),
  };
  return scrubbed as T;
}
