import { messages } from "@/messages";
import { cn } from "@/utils/cn";

/** The console's masthead controls (theme-toggle.tsx, console-masthead.tsx): the steel 36px hairline box. */
export const MASTHEAD_CONTROL = "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap border px-3 font-display text-label font-semibold uppercase leading-none tracking-caps";
/** A square icon-only console masthead control (theme): the shared 36px box with no label. */
export const MASTHEAD_ICON_CONTROL = "press size-9 cursor-pointer justify-center border-line bg-transparent px-0 text-accent-text hover:border-line-strong hover:bg-accent/12 active:bg-accent/20";

export interface NavItem {
  readonly href: "/" | "/watchlist" | "/pre-booking" | "/accuracy";
  readonly label: string;
}

/** The four product keys, in v4's order. Check a PNR is "Check" in the footer and the tab bar. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/", label: messages.shell.nav.check },
  { href: "/watchlist", label: messages.shell.nav.watchlist },
  { href: "/pre-booking", label: messages.shell.nav.preBooking },
  { href: "/accuracy", label: messages.shell.nav.accuracy },
];

/** A nav key's own words: the first is "Check a PNR" in the masthead and the menu. */
export function navLabel(item: NavItem): string {
  return item.href === "/" ? messages.shell.nav.cta : item.label;
}

/**
 * v4 .btn as a nav key: Space Grotesk 700 14/20, 2px edge, 3px radius, the 3px hard shadow it presses into. The current
 * page is the yellow primary (lime on hover), the rest paper that turns pink. `tall` is the menu drawer's 48px, 16px key.
 */
export function navKeyClass(active: boolean, tall = false): string {
  return cn(
    "nb-press tap-44 inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-control border-2 border-edge px-4 font-structure font-bold no-underline shadow-control",
    tall ? "min-h-12 w-full justify-start text-base leading-6" : "min-h-10 justify-center text-sm leading-5",
    active ? "bg-accent text-on-fill hover:bg-lime hover:text-on-fill" : "bg-paper text-ink-1 hover:bg-pink hover:text-on-fill",
  );
}

/** The 40px square keys at the masthead's right (theme, sign in, account): paper, edged, the control shadow. */
export const MASTHEAD_KEY =
  "nb-press tap-44 inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-control border-2 border-edge bg-paper p-0 text-ink-1 no-underline shadow-control hover:bg-pink hover:text-on-fill max-sm:shadow-control-sm";

/** The saved count beside Watchlist (v4): Space Mono 12/16 in a small edged paper box. Decorative; the link keeps its name. */
export const COUNT_CHIP = "rounded-control border-2 border-edge bg-paper px-1.5 font-figure text-xs leading-4 text-ink-1";

/** In-page anchors on the landing sheet. The landing sections must carry these ids. */
export const LANDING_SECTIONS: readonly { readonly id: string; readonly label: string }[] = [
  { id: "how", label: messages.shell.nav.sections.how },
  { id: "reliability", label: messages.shell.nav.sections.reliability },
  { id: "roadmap", label: messages.shell.nav.sections.roadmap },
  { id: "faq", label: messages.shell.nav.sections.faq },
];

/** The id of the landing's check plate, the target of every "Check a PNR" link. */
export const TERMINAL_ID = "terminal";

/** Where a nav item points: on the landing, Check a PNR jumps to the check plate instead of reloading "/". */
export function navTarget(pathname: string, href: NavItem["href"]): NavItem["href"] | `#${typeof TERMINAL_ID}` {
  return href === "/" && pathname === "/" ? (`#${TERMINAL_ID}` as const) : href;
}

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
