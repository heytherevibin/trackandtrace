"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { MASTHEAD_CONTROL, MINIMAL_HEADER_ROUTES, NAV_ITEM_ACTIVE, NAV_ITEM_IDLE, PRIMARY_NAV, isActive, navTarget } from "./nav-config";
import { NavMenu } from "./nav-menu";
import { UserMenu } from "./user-menu";

// Each item is its own hairline box, the same control box as the theme and sign-in buttons. The current
// page is tinted steel; .press gives it the app-wide press (motion.css).
const ITEM = cn(MASTHEAD_CONTROL, "press no-underline");

/**
 * The masthead, the same on every page: one sticky hairline row. From lg: the wordmark; the nav (Check a
 * PNR, Watchlist, Pre-booking, Accuracy), each its own hairline box with a Fluent Filled icon beside its
 * capital label, the current page tinted steel; then the theme icon button (System → Day → Night) and SIGN
 * IN (or the account menu) on the right. Below lg: the hamburger on the left of the logo mark (the name
 * shows from lg), with the same theme button and sign in on the right; the hamburger opens the nav in a
 * sheet from the left. On the landing, Check a PNR jumps to the check plate. The landing's section anchors
 * live in the footer. /login shows the brand only.
 */
export function TopNav() {
  const pathname = usePathname();
  const minimal = MINIMAL_HEADER_ROUTES.includes(pathname);

  return (
    <header className={cn("border-b border-line bg-surface-0", !minimal && "sticky top-0 z-nav")} style={{ viewTransitionName: "site-header" }}>
      <div className="page-frame flex h-16 items-center gap-x-3 lg:gap-x-5">
        {minimal ? null : <NavMenu pathname={pathname} className="lg:hidden" />}
        {/* The mark alone is 24px wide on a phone. Its hit area grows rightward into the mr-auto gap
            (motion.css): centred, it would reach back over the menu button beside it. */}
        <Link href="/" aria-label={messages.common.productName} className="tap-44-start mr-auto inline-flex h-16 items-center text-ink-1 no-underline hover:text-ink-1 lg:mr-2">
          <Wordmark nameFrom={minimal ? undefined : "lg"} />
        </Link>
        {minimal ? null : (
          <>
            <nav aria-label={messages.shell.nav.primaryLabel} className="hidden flex-1 items-center gap-2 lg:flex">
              {PRIMARY_NAV.map(({ href, label, Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link key={href} href={navTarget(pathname, href)} aria-current={active ? "page" : undefined} className={cn(ITEM, active ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE)}>
                    <Icon className="size-5 shrink-0" aria-hidden="true" />
                    <span>{href === "/" ? messages.shell.nav.cta : label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <UserMenu />
            </div>
          </>
        )}
      </div>
    </header>
  );
}
