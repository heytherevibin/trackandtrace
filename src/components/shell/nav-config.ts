import {
  CalendarClockFilled,
  EyeFilled,
  GaugeFilled,
  PersonFilled,
  TicketDiagonalFilled,
} from "@/components/icons";
import { messages } from "@/messages";

/** Navigation icons are Fluent Filled, drawn at 20px (their native grid). */
/** Every masthead control (nav boxes, theme button, sign in) shares this box: 36px, hairline, 13px capitals. */
export const MASTHEAD_CONTROL = "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap border px-3 font-display text-label font-semibold uppercase leading-none tracking-caps";
export type NavIcon = typeof TicketDiagonalFilled;

/** A nav box's state: the current page tinted steel, the rest hairline boxes that tint on hover. */
export const NAV_ITEM_ACTIVE = "border-accent bg-accent/16 text-accent-text hover:text-accent-text";
export const NAV_ITEM_IDLE = "border-line text-ink-1/70 hover:border-line-strong hover:bg-accent/12 hover:text-ink-1";

/** A square icon-only masthead control (theme, menu, close): the shared 36px box with no label. */
export const MASTHEAD_ICON_CONTROL = "press size-9 cursor-pointer justify-center border-line bg-transparent px-0 text-accent-text hover:border-line-strong hover:bg-accent/12 active:bg-accent/20";

export interface NavItem {
  readonly href: "/" | "/watchlist" | "/pre-booking" | "/accuracy" | "/account" | "/login";
  readonly label: string;
  readonly Icon: NavIcon;
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/", label: messages.shell.nav.check, Icon: TicketDiagonalFilled },
  { href: "/watchlist", label: messages.shell.nav.watchlist, Icon: EyeFilled },
  { href: "/pre-booking", label: messages.shell.nav.preBooking, Icon: CalendarClockFilled },
  { href: "/accuracy", label: messages.shell.nav.accuracy, Icon: GaugeFilled },
];

export const ACCOUNT_ITEM: NavItem = { href: "/account", label: messages.shell.nav.account, Icon: PersonFilled };
export const SIGN_IN_ITEM: NavItem = { href: "/login", label: messages.shell.nav.signIn, Icon: PersonFilled };

/** In-page anchors on the landing sheet. The landing sections must carry these ids. */
export const LANDING_SECTIONS: readonly { readonly id: string; readonly label: string }[] = [
  { id: "how", label: messages.shell.nav.sections.how },
  { id: "record", label: messages.shell.nav.sections.record },
  { id: "roadmap", label: messages.shell.nav.sections.roadmap },
  { id: "faq", label: messages.shell.nav.sections.faq },
];

/** The id of the landing's check plate, the target of every "Check a PNR" link. */
export const TERMINAL_ID = "terminal";

/** Routes that render the minimal header: brand only. */
export const MINIMAL_HEADER_ROUTES: readonly string[] = ["/login"];

/** Where a nav item points: on the landing, Check a PNR jumps to the check plate instead of reloading "/". */
export function navTarget(pathname: string, href: NavItem["href"]): NavItem["href"] | `#${typeof TERMINAL_ID}` {
  return href === "/" && pathname === "/" ? (`#${TERMINAL_ID}` as const) : href;
}

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
