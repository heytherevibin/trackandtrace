import { BookmarkRegular, CalendarClockRegular, GaugeRegular, TicketDiagonalRegular } from "@/components/icons";
import { messages } from "@/messages";

export interface NavItem {
  readonly href: "/" | "/watchlist" | "/pre-booking" | "/accuracy" | "/account" | "/login";
  readonly label: string;
  readonly Icon: typeof TicketDiagonalRegular;
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/", label: messages.shell.nav.check, Icon: TicketDiagonalRegular },
  { href: "/watchlist", label: messages.shell.nav.watchlist, Icon: BookmarkRegular },
  { href: "/pre-booking", label: messages.shell.nav.preBooking, Icon: CalendarClockRegular },
  { href: "/accuracy", label: messages.shell.nav.accuracy, Icon: GaugeRegular },
];


/** In-page anchors on the landing sheet. The landing sections must carry these ids. */
export const LANDING_SECTIONS = [
  { id: "how", label: messages.shell.nav.sections.how },
  { id: "record", label: messages.shell.nav.sections.record },
  { id: "sources", label: messages.shell.nav.sections.sources },
  { id: "roadmap", label: messages.shell.nav.sections.roadmap },
  { id: "faq", label: messages.shell.nav.sections.faq },
] as const;

/** The id of the landing's check plate, the target of every "Check a PNR" link. */
export const TERMINAL_ID = "terminal";

/** Routes that render the minimal header: brand and theme only. */
export const MINIMAL_HEADER_ROUTES: readonly string[] = ["/login"];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
