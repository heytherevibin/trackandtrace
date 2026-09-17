"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { MASTHEAD_CONTROL, MINIMAL_HEADER_ROUTES, PRIMARY_NAV, TERMINAL_ID, isActive } from "./nav-config";
import { UserMenu } from "./user-menu";

// Each item is its own hairline box, the same control box as the theme and sign-in buttons. The current
// page is tinted steel; a press settles the box inward.
const ITEM = cn(MASTHEAD_CONTROL, "press no-underline transition-transform duration-(--duration-fast) active:scale-95");

/**
 * The masthead, the same on every page: brand; the nav (Check a PNR, Watchlist, Pre-booking,
 * Accuracy), each its own hairline box with a Fluent Filled icon beside its capital label, the current
 * page tinted steel; the one theme button (System → Day → Night); and SIGN IN (or the account menu) as its own button on the
 * right. On the landing, Check a PNR jumps to the check plate. From lg it is one sticky hairline row;
 * below lg it is two aligned tiers (brand and sign in, then the nav with the theme cells, scrolling
 * sideways on a phone). The landing's section anchors live in the footer.
 */
export function TopNav() {
  const pathname = usePathname();
  const onLanding = pathname === "/";
  const minimal = MINIMAL_HEADER_ROUTES.includes(pathname);

  return (
    <header className={cn("border-b border-line bg-surface-0", !minimal && "sticky top-0 z-nav")} style={{ viewTransitionName: "site-header" }}>
      <div className="page-frame flex flex-wrap items-center gap-x-5">
        <Link href="/" className="mr-auto inline-flex h-16 items-center text-ink-1 no-underline hover:text-ink-1 lg:mr-2">
          <Wordmark />
        </Link>
        {minimal ? null : (
          <>
            <div className="scrollbar-none order-last flex w-full items-center justify-between gap-5 overflow-x-auto border-t border-line py-2.5 lg:order-none lg:w-auto lg:flex-1 lg:overflow-visible lg:border-t-0 lg:py-0">
              <nav aria-label={messages.shell.nav.primaryLabel} className="flex items-center gap-2">
                {PRIMARY_NAV.map(({ href, label, Icon }) => {
                  const check = href === "/";
                  const active = isActive(pathname, href);
                  const target = check && onLanding ? `#${TERMINAL_ID}` : href;
                  return (
                    <Link
                      key={href}
                      href={target}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        ITEM,
                        active
                          ? "border-accent bg-accent/16 text-accent-text hover:text-accent-text"
                          : "border-line text-ink-1/70 hover:border-line-strong hover:bg-accent/12 hover:text-ink-1",
                      )}
                    >
                      <Icon className="size-5 shrink-0" aria-hidden="true" />
                      <span>{check ? messages.shell.nav.cta : label}</span>
                    </Link>
                  );
                })}
              </nav>
              <ThemeToggle />
            </div>
            <div className="flex h-16 items-center">
              <UserMenu />
            </div>
          </>
        )}
      </div>
    </header>
  );
}
