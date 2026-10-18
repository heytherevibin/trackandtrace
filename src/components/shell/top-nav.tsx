"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/components/brand/mark";
import { SiteThemeKey } from "@/components/theme/site-theme-key";
import { messages } from "@/messages";
import { PRIMARY_NAV, isActive, navKeyClass, navLabel, navTarget } from "./nav-config";
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
    <header className="sticky top-0 z-nav border-b-2 border-edge ground" style={{ viewTransitionName: "site-header" }}>
      <div className="page-frame flex flex-wrap items-center gap-x-4 gap-y-3 py-3 max-sm:flex-nowrap max-sm:gap-2 max-sm:py-1.5">
        <Link
          href="/"
          aria-label={messages.shell.brandHome}
          className="mr-2 inline-flex min-h-11 items-center gap-2.5 text-ink-1 no-underline hover:bg-transparent hover:text-ink-1 max-sm:mr-auto"
        >
          <span className="inline-flex overflow-hidden rounded-plate border-2 border-edge">
            <Mark size={24} className="block max-sm:size-5" />
          </span>
          <span className="font-display text-xl uppercase leading-6 max-sm:text-lg">{messages.common.productName}</span>
        </Link>
        <nav aria-label={messages.shell.nav.primaryLabel} className="flex flex-auto flex-wrap gap-2 max-sm:hidden">
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
          <SiteThemeKey />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
