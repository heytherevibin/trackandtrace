"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/components/brand/mark";
import { SiteThemeKey } from "@/components/theme/site-theme-key";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { MASTHEAD_KEY, PRIMARY_NAV, isActive, navKeyClass, navLabel, navTarget } from "./nav-config";
import { MenuDrawer } from "./tab-bar";
import { UserMenu } from "./user-menu";
import { WatchCountChip } from "./watch-count-chip";

/**
 * The masthead, as Neubrutal v4 draws it (header > .mh): sticky, on the page ground with its grain, ruled off with the
 * 2px edge. The edged mark and TRAKLINE in Archivo Black; the four nav keys (.btn, 40px; the current page is the yellow
 * primary, Watchlist carries its saved count), which wrap rather than run off; then the 40px theme and sign-in keys.
 * Below 640px the nav keys step aside for the tab bar (tab-bar.tsx) and the row tightens to 6px × 12px.
 */
export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="@container sticky top-0 z-nav border-b-2 border-edge ground" style={{ viewTransitionName: "site-header" }}>
      {/* One row, as v4 draws it; only where the keys cannot fit beside the brand (a phone with its text at 200%) do they
          take a row of their own, never run past the window. */}
      <div className="page-frame flex flex-wrap items-center gap-x-4 gap-y-3 py-3 max-sm:gap-2 max-sm:py-1.5">
        <Link
          href="/"
          aria-label={messages.shell.brandHome}
          className="tap-44-start mr-2 inline-flex min-h-11 items-center gap-2.5 text-ink-1 no-underline hover:bg-transparent hover:text-ink-1 max-sm:mr-auto"
        >
          <span className="inline-flex overflow-hidden rounded-plate border-2 border-edge">
            <Mark size={24} className="block max-sm:size-5" />
          </span>
          {/* Visually hidden only where the row cannot hold it beside the keys: a phone with its text at 200% (a container
              in rem, so at 100% text a 320px phone keeps the name). The link keeps its name either way. */}
          <span className="font-display text-xl uppercase leading-6 max-sm:text-lg @max-[22rem]:sr-only">{messages.common.productName}</span>
        </Link>
        {/* The nav keys fold into the Menu key where the masthead is under 40rem wide yet the window is no phone's: text
            made larger (200% at 640 to 1279px). A container in rem grows with the text, where a media query does not. */}
        <nav aria-label={messages.shell.nav.primaryLabel} className="flex flex-auto flex-wrap gap-2 max-sm:hidden @max-[40rem]:hidden">
          {PRIMARY_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={navTarget(pathname, item.href)} aria-current={active ? "page" : undefined} className={navKeyClass(active)}>
                {navLabel(item)}
                {item.href === "/watchlist" ? <WatchCountChip /> : null}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 max-sm:gap-1.5">
          <MenuDrawer
            trigger={(Trigger) => (
              <Trigger aria-label={messages.shell.nav.openMenu} title={messages.shell.nav.menu} className={cn(MASTHEAD_KEY, "hidden @max-[40rem]:inline-flex max-sm:hidden")}>
                <span aria-hidden="true" className="flex h-3.5 w-[18px] flex-col justify-between">
                  <span className="block h-0.5 bg-current" />
                  <span className="block h-0.5 bg-current" />
                  <span className="block h-0.5 bg-current" />
                </span>
              </Trigger>
            )}
          />
          <SiteThemeKey />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
