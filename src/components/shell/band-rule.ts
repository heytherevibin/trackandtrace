// Where the "Updates by email" band is drawn (the owner, 2026-10-01). A plain module, so the shell's client
// component and any server file can both read it.

export type BandVariant = "full" | "slim";

/** The band's id on the page: the section, and the landing's entrance for it (journey/arrivals.ts). */
export const UPDATES_BAND_ID = "updates";

/**
 * Pages with no band, each with everything under it. /subscribe/confirm and /unsubscribe are where a reader confirms
 * or leaves a list; /login and /pre-booking ask for an address of their own; /offline cannot send one.
 */
const HIDDEN: readonly string[] = ["/subscribe", "/unsubscribe", "/login", "/pre-booking", "/offline"];

/** Full on the landing, slim on every other traveller page, none on the hidden ones. */
export function bandVariant(pathname: string): BandVariant | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/" || path === "") return "full";
  return HIDDEN.some((hidden) => path === hidden || path.startsWith(`${hidden}/`)) ? null : "slim";
}
