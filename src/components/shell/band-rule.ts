// Where the "Updates by email" band is drawn (the owner, 2026-10-01). A plain module, so the shell's client
// component and any server file can both read it.

export type BandVariant = "full" | "slim";

/** The band's id on the page: the section, and the landing's entrance for it (journey/arrivals.ts). */
export const UPDATES_BAND_ID = "updates";

/**
 * Pages with no band, exactly these addresses. /subscribe/confirm and /unsubscribe are where a reader confirms or
 * leaves a list; /login and /pre-booking ask for an address of their own; /offline cannot send one. Nothing is routed
 * under any of them, so an address under one (/subscribe/x, /login/x) is the site's not-found page, an ordinary page
 * with the slim band.
 */
const HIDDEN: ReadonlySet<string> = new Set(["/subscribe/confirm", "/unsubscribe", "/login", "/pre-booking", "/offline"]);

/** Full on the landing, slim on every other traveller page, none on the hidden ones. A trailing slash is the same page. */
export function bandVariant(pathname: string): BandVariant | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/" || path === "") return "full";
  return HIDDEN.has(path) ? null : "slim";
}
