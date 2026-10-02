"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import {
  MASTHEAD_CONTROL,
  MINIMAL_HEADER_ROUTES,
  NAV_ITEM_ACTIVE,
  NAV_ITEM_IDLE,
  PRIMARY_NAV,
  isActive,
  navTarget,
} from "./nav-config";
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
 * sheet from the left. On the landing, Check a PNR jumps to the check plate. /login shows the brand only.
 */
export function TopNav() {
  const pathname = usePathname();
  const minimal = MINIMAL_HEADER_ROUTES.includes(pathname);

  return (
    <header
      className={cn(
        "border-b border-line ground",
        !minimal && "sticky top-0 z-nav",
      )}
      style={{ viewTransitionName: "site-header" }}
    >
      {/* A query container, in rem, the masthead's full width: the nav stands open only where the window is lg AND this
          is 62rem wide, which at the drawn sizes is the same (62rem is lg less the widest scrollbar), and with text made
          larger (200%) is not: then the nav folds into the menu, and the masthead keeps its one row, the height every
          pinned piece sticks under. Not the sticky header itself: WebKit then read the header's box stale in the task
          a scroll changed (by the header's old place), and the run's unpin landed a reader 402px off (J6 nightly).
          One row, 64px. The menu's row compacts before it wraps: below 16.5rem of this container SIGN IN keeps only its
          icon (user-menu.tsx), so a 390px phone at 200% text keeps one row. Should even that not fit (a narrower phone,
          text at 200%), it reflows as the last resort: the controls drop to a row of their own, as tall as the first,
          so nothing is pushed past the window's edge. The row's side margin is the page's as drawn, held in px here on
          every page, the landing included (tokens.css keeps the landing's in rem): a margin doubled with the text took
          the 40px that keeps a 360px phone at 200% to one row. */}
      <div className="@container">
        <div className="page-frame flex min-h-16 flex-wrap items-center gap-x-3 [--gutter:clamp(20px,5vw,72px)] lg:gap-x-5">
          {minimal ? null : (
            <NavMenu pathname={pathname} className="lg:@min-[62rem]:hidden" />
          )}
          {/* The mark alone is 24px wide on a phone. Its hit area grows rightward into the mr-auto gap
            (motion.css): centred, it would reach back over the menu button beside it. */}
          <Link
            href="/"
            aria-label={messages.common.productName}
            className="tap-44-start mr-auto inline-flex h-16 items-center text-ink-1 no-underline hover:text-ink-1 lg:mr-2"
          >
            <Wordmark nameFrom={minimal ? undefined : "lg"} />
          </Link>
          {minimal ? null : (
            <>
              <nav
                aria-label={messages.shell.nav.primaryLabel}
                className="hidden flex-1 flex-wrap items-center gap-2 lg:@min-[62rem]:flex"
              >
                {PRIMARY_NAV.map(({ href, label, Icon }) => {
                  const active = isActive(pathname, href);
                  return (
                    <Link
                      key={href}
                      href={navTarget(pathname, href)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        ITEM,
                        active ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE,
                      )}
                    >
                      <Icon className="size-5 shrink-0" aria-hidden="true" />
                      <span>
                        {href === "/" ? messages.shell.nav.cta : label}
                      </span>
                    </Link>
                  );
                })}
              </nav>
              <div className="ml-auto flex min-h-16 items-center gap-2">
                <ThemeToggle />
                <UserMenu />
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
