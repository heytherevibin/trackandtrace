import {
  BookmarkFilled,
  CalendarClockFilled,
  DatabaseFilled,
  DocumentTableFilled,
  FlowchartFilled,
  GaugeFilled,
  PersonFilled,
  QuestionCircleFilled,
  RoadFilled,
  TicketDiagonalFilled,
} from "@/components/icons";
import { messages } from "@/messages";

/** Navigation icons are Fluent Filled, drawn at 20px (their native grid). */
export type NavIcon = typeof TicketDiagonalFilled;

export interface NavItem {
  readonly href: "/" | "/watchlist" | "/pre-booking" | "/accuracy" | "/account" | "/login";
  readonly label: string;
  readonly Icon: NavIcon;
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/", label: messages.shell.nav.check, Icon: TicketDiagonalFilled },
  { href: "/watchlist", label: messages.shell.nav.watchlist, Icon: BookmarkFilled },
  { href: "/pre-booking", label: messages.shell.nav.preBooking, Icon: CalendarClockFilled },
  { href: "/accuracy", label: messages.shell.nav.accuracy, Icon: GaugeFilled },
];

export const ACCOUNT_ITEM: NavItem = { href: "/account", label: messages.shell.nav.account, Icon: PersonFilled };
export const SIGN_IN_ITEM: NavItem = { href: "/login", label: messages.shell.nav.signIn, Icon: PersonFilled };

/** In-page anchors on the landing sheet. The landing sections must carry these ids. */
export const LANDING_SECTIONS: readonly { readonly id: string; readonly label: string; readonly Icon: NavIcon }[] = [
  { id: "how", label: messages.shell.nav.sections.how, Icon: FlowchartFilled },
  { id: "record", label: messages.shell.nav.sections.record, Icon: DocumentTableFilled },
  { id: "sources", label: messages.shell.nav.sections.sources, Icon: DatabaseFilled },
  { id: "roadmap", label: messages.shell.nav.sections.roadmap, Icon: RoadFilled },
  { id: "faq", label: messages.shell.nav.sections.faq, Icon: QuestionCircleFilled },
];

/** The id of the landing's check plate, the target of every "Check a PNR" link. */
export const TERMINAL_ID = "terminal";

/** Routes that render the minimal header: brand only. */
export const MINIMAL_HEADER_ROUTES: readonly string[] = ["/login"];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
