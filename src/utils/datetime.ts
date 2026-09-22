// Every time in the product is Indian Standard Time, formatted for en-IN.

export const LOCALE = "en-IN" as const;
export const TIME_ZONE = "Asia/Kolkata" as const;
export const IST = TIME_ZONE;

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE });
const shortDateFormat = new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "2-digit", month: "short", timeZone: TIME_ZONE });
const mediumDateFormat = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", year: "numeric", timeZone: TIME_ZONE });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE });
const dateTimeSecondsFormat = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: TIME_ZONE });
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
const countFormat = new Intl.NumberFormat(LOCALE);

/** "10:35" */
export function formatTime(value: string | Date): string {
  return timeFormat.format(toDate(value));
}

/** short: "Mon, 15 Jun" · medium: "15 Jun 2026" */
export function formatDate(value: string | Date, style: "short" | "medium" = "medium"): string {
  return (style === "short" ? shortDateFormat : mediumDateFormat).format(toDate(value));
}

/** "15 Jun 2026, 10:35" */
export function formatDateTime(value: string | Date): string {
  return dateTimeFormat.format(toDate(value));
}

/**
 * "15 Jun 2026, 10:35:12" -- the same moment to the second.
 *
 * For a record rather than a schedule: the audit log's drawer draws seconds
 * (AuditLog.dc.html:229) while its table stops at the minute, because two entries a few seconds
 * apart are two different actions and the order between them is the thing being read.
 */
export function formatDateTimeSeconds(value: string | Date): string {
  return dateTimeSecondsFormat.format(toDate(value));
}

/** "3 min ago", "in 2 hr", "yesterday". Floors at one minute. */
export function formatRelative(value: string | Date, now: Date = new Date()): string {
  const diffMs = toDate(value).getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  if (abs < MINUTE_MS) return relativeFormat.format(0, "minute");
  if (abs < HOUR_MS) return relativeFormat.format(Math.round(diffMs / MINUTE_MS), "minute");
  if (abs < 24 * HOUR_MS) return relativeFormat.format(Math.round(diffMs / HOUR_MS), "hour");
  return relativeFormat.format(Math.round(diffMs / (24 * HOUR_MS)), "day");
}

/** Countdown to a moment: { state, hours, minutes }. */
export function countdownTo(target: string | Date, now: Date = new Date()): { readonly state: "ahead" | "passed"; readonly hours: number; readonly minutes: number } {
  const diff = toDate(target).getTime() - now.getTime();
  if (diff <= 0) return { state: "passed", hours: 0, minutes: 0 };
  const hours = Math.floor(diff / HOUR_MS);
  const minutes = Math.floor((diff % HOUR_MS) / MINUTE_MS);
  return { state: "ahead", hours, minutes };
}

/** A journey date is an IST calendar day. */
export function parseJourneyDate(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00+05:30`);
}

export function formatCount(n: number): string {
  return countFormat.format(n);
}

/** Legacy aliases kept while the incumbent result page migrates. */
export const fmtTimeIST = formatTime;
export const fmtDayShort = (value: string | Date): string => formatDate(value, "short");
