import { BookmarkRegular, CalendarClockRegular, GaugeRegular, PersonRegular, TicketDiagonalRegular } from "@/components/icons";
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

export const TAB_CHECK: NavItem = PRIMARY_NAV[0]!;
export const TAB_WATCHLIST: NavItem = PRIMARY_NAV[1]!;
export const TAB_ACCOUNT: NavItem = { href: "/account", label: messages.shell.nav.account, Icon: PersonRegular };
export const TAB_SIGN_IN: NavItem = { href: "/login", label: messages.shell.nav.signIn, Icon: PersonRegular };

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
