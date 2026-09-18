"use client";

import { Drawer } from "@base-ui/react/drawer";
import Link from "next/link";
import { useRef, useState, type MouseEvent } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { DismissFilled, LineHorizontal3Filled } from "@/components/icons";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { MASTHEAD_CONTROL, MASTHEAD_ICON_CONTROL, NAV_ITEM_ACTIVE, NAV_ITEM_IDLE, PRIMARY_NAV, isActive, navTarget } from "./nav-config";

// The masthead's menu below lg: a square hamburger box on the left, and a sheet that slides in from
// that edge (and swipes back to it) holding the four nav boxes, the current page tinted steel.

const ITEM = cn(MASTHEAD_CONTROL, "press h-12 w-full no-underline");

export function NavMenu({ pathname, className }: { readonly pathname: string; readonly className?: string }) {
  const m = messages.shell.nav;
  const [open, setOpen] = useState(false);
  // An in-page jump waits until the sheet has closed and released its scroll lock.
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
      <Drawer.Trigger aria-label={m.openMenu} className={cn(MASTHEAD_CONTROL, MASTHEAD_ICON_CONTROL, className)}>
        <LineHorizontal3Filled className="size-5" aria-hidden="true" />
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-sheet bg-backdrop transition-opacity duration-(--duration-base) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Drawer.Viewport className="fixed inset-0 z-sheet flex justify-start">
          <Drawer.Popup
            className={cn(
              "flex h-dvh w-80 max-w-[86vw] flex-col border-r border-line bg-surface-0 pb-(--safe-bottom) outline-none",
              "translate-x-(--drawer-swipe-movement-x) transition-transform duration-(--duration-slow) ease-out-expo data-[swiping]:duration-0",
              "data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full",
            )}
          >
            <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line px-5">
              <Wordmark />
              <Drawer.Close aria-label={m.closeMenu} className={cn(MASTHEAD_CONTROL, MASTHEAD_ICON_CONTROL)}>
                <DismissFilled className="size-5" aria-hidden="true" />
              </Drawer.Close>
            </div>
            <Drawer.Title className="sr-only">{m.menu}</Drawer.Title>
            <Drawer.Content className="min-h-0 flex-1 overflow-y-auto p-5">
              <nav aria-label={m.menu} className="flex flex-col gap-2">
                {PRIMARY_NAV.map(({ href, label, Icon }) => {
                  const active = isActive(pathname, href);
                  const target = navTarget(pathname, href);
                  return (
                    <Link
                      key={href}
                      href={target}
                      aria-current={active ? "page" : undefined}
                      onClick={(event) => choose(event, target)}
                      className={cn(ITEM, active ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE)}
                    >
                      <Icon className="size-5 shrink-0" aria-hidden="true" />
                      <span>{href === "/" ? m.cta : label}</span>
                    </Link>
                  );
                })}
              </nav>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
