/**
 * A journey date the forms will take: ten days out, in IST, as YYYY-MM-DD. The specs typed 2026-10-15 until that day
 * passed, and a past date leaves Find trains disabled and the availability endpoint refusing.
 */
export const JOURNEY_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(
  new Date(Date.now() + 10 * 86_400_000),
);
