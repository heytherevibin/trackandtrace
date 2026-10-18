"use client";

import { Drawer } from "@base-ui/react/drawer";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useUser } from "@/components/session/session-provider";
import { SiteThemeRow } from "@/components/theme/site-theme-key";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { PRIMARY_NAV, isActive, navKeyClass, navLabel, navTarget } from "./nav-config";
import { WatchCountChip } from "./watch-count-chip";

// The phone's navigation (v4, below 640px): a tab bar fixed to the foot of the window — Check, Watchlist, Pre-booking
// and Menu, the current tab yellow — and the menu drawer it opens from the left. The bar steps aside while the PNR field
// has focus, for the pinned Run bar (html[data-runbar], neubrutal.css).

const TAB = "relative flex min-h-15 min-w-0 flex-col items-center justify-center gap-1.5 border-0 border-l-2 border-edge bg-transparent px-0.5 text-center font-figure text-2xs uppercase tracking-wide text-ink-2 no-underline wrap-anywhere first:border-l-0 hover:bg-transparent";
const TAB_ON = "bg-accent text-on-fill hover:bg-accent hover:text-on-fill";
const TAB_COUNT = "absolute right-[calc(50%-26px)] top-2 grid h-4 min-w-4 place-items-center rounded-control border-2 border-edge bg-pink px-1 font-figure text-3xs leading-3 text-on-fill";

/** v4's tab glyphs: drawn shapes in the tab's own ink, not icons. */
const GLYPH: Record<"check" | "watchlist" | "preBooking" | "menu", ReactNode> = {
  check: <span aria-hidden="true" className="block h-3 w-[18px] rounded-control border-2 border-current" />,
  watchlist: <span aria-hidden="true" className="block size-3.5 rounded-full border-2 border-current" />,
  preBooking: <span aria-hidden="true" className="block h-3.5 w-4 border-2 border-t-[5px] border-current" />,
  menu: (
    <span aria-hidden="true" className="flex h-3.5 w-[18px] flex-col justify-between">
      <span className="block h-0.5 bg-current" />
      <span className="block h-0.5 bg-current" />
      <span className="block h-0.5 bg-current" />
    </span>
  ),
};

const TABS = [
  { href: "/" as const, key: "check" as const, label: messages.shell.tabs.check },
  { href: "/watchlist" as const, key: "watchlist" as const, label: messages.shell.tabs.watchlist },
  { href: "/pre-booking" as const, key: "preBooking" as const, label: messages.shell.tabs.preBooking },
];

function SignKey({ onChoose }: { readonly onChoose: () => void }) {
  const user = useUser();
  const href = user ? "/account" : "/login";
  return (
    <Link href={href} onClick={onChoose} className={navKeyClass(false, true)}>
      {user ? messages.shell.nav.account : messages.shell.nav.signIn}
    </Link>
  );
}

/** The menu drawer (v4 nav[aria-label=Menu]), opened by `trigger`: the tab bar's Menu on a phone, or the masthead's Menu
 *  key where text made larger leaves the masthead no room for its nav keys. */
export function MenuDrawer({ trigger }: { readonly trigger: (Trigger: typeof Drawer.Trigger) => ReactNode }) {
  const pathname = usePathname();
  const m = messages.shell.nav;
  const [open, setOpen] = useState(false);
  // An in-page jump waits until the drawer has closed and released its scroll lock.
  const pendingHash = useRef<string | null>(null);

  const choose = (event: MouseEvent<HTMLAnchorElement>, target: string) => {
    if (target.startsWith("#")) {
      event.preventDefault();
      pendingHash.current = target;
    }
    setOpen(false);
  };
  const afterClose = (nowOpen: boolean) => {
    const hash = pendingHash.current;
    if (nowOpen || !hash) return;
    pendingHash.current = null;
    window.history.pushState(null, "", hash);
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  };

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} onOpenChangeComplete={afterClose} swipeDirection="left">
      {trigger(Drawer.Trigger)}
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-sheet bg-backdrop transition-opacity duration-(--duration-base) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Drawer.Viewport className="fixed inset-0 z-sheet flex justify-start">
          <Drawer.Popup
            className={cn(
              "drawer-shadow flex h-dvh w-80 max-w-[86vw] flex-col border-r-2 border-edge bg-canvas pb-(--safe-bottom) outline-none",
              "translate-x-(--drawer-swipe-movement-x) transition-transform duration-(--duration-slow) ease-out-expo data-[swiping]:duration-0",
              "data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full",
            )}
          >
            <div className="flex shrink-0 items-center justify-between border-b-2 border-edge px-4 pb-3 pt-3">
              <Drawer.Title className="m-0 font-display text-lg uppercase leading-6">{m.menu}</Drawer.Title>
              <Drawer.Close aria-label={m.closeMenu} className="nb-press inline-flex size-11 cursor-pointer items-center justify-center rounded-control border-2 border-edge bg-paper text-ink-1 shadow-control hover:bg-pink hover:text-on-fill">
                <span aria-hidden="true">✕</span>
              </Drawer.Close>
            </div>
            <Drawer.Content className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <nav aria-label={m.menu} className="flex flex-col gap-2.5 p-4">
                {PRIMARY_NAV.map((item) => {
                  const active = isActive(pathname, item.href);
                  const target = navTarget(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={target}
                      aria-current={active ? "page" : undefined}
                      onClick={(event) => choose(event, target)}
                      className={cn(navKeyClass(active, true), item.href === "/watchlist" && "justify-between")}
                    >
                      {navLabel(item)}
                      {item.href === "/watchlist" ? <WatchCountChip /> : null}
                    </Link>
                  );
                })}
              </nav>
              <div className="mt-auto flex flex-col gap-2.5 border-t-2 border-edge p-4">
                <Suspense fallback={null}>
                  <SignKey onChoose={() => setOpen(false)} />
                </Suspense>
                <SiteThemeRow />
                <p className="legend m-0 mt-1">{messages.shell.menuDisclaimer}</p>
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function TabBar() {
  const pathname = usePathname();
  return (
    // left-0 w-screen, not inset-x-0: 100vw is the window's own width, where inset-x-0 takes the layout viewport's, which
    // a phone browser widens to anything that overflowed for a moment and which this bar would then hold wide for good.
    <nav aria-label={messages.shell.nav.tabsLabel} className="tab-bar fixed bottom-0 left-0 z-nav grid w-screen grid-cols-[repeat(4,minmax(0,1fr))] border-t-2 border-edge ground pb-(--safe-bottom) sm:hidden">
      {TABS.map((tab) => {
        const active = isActive(pathname, tab.href);
        const target = navTarget(pathname, tab.href);
        return (
          <Link key={tab.href} href={target} aria-current={active ? "page" : undefined} className={cn(TAB, active && TAB_ON)}>
            {GLYPH[tab.key]}
            {tab.label}
            {tab.key === "watchlist" ? <WatchCountChip className={TAB_COUNT} /> : null}
          </Link>
        );
      })}
      <MenuDrawer
        trigger={(Trigger) => (
          <Trigger className={cn(TAB, "cursor-pointer")}>
            {GLYPH.menu}
            {messages.shell.tabs.menu}
          </Trigger>
        )}
      />
    </nav>
  );
}
