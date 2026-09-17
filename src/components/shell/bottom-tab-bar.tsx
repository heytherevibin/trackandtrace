"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Led } from "@/components/ui/led";
import { useUser } from "@/components/session/session-provider";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { TAB_ACCOUNT, TAB_CHECK, TAB_SIGN_IN, TAB_WATCHLIST, isActive, type NavItem } from "./nav-config";

function Tab({ item, pathname }: { readonly item: NavItem; readonly pathname: string }) {
  const active = isActive(pathname, item.href) || (item.href === "/login" && isActive(pathname, "/account"));
  const Icon = item.Icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn("press flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-md py-1.5 transition-colors", active ? "text-ink-1" : "text-ink-2")}
      data-testid={`tab-${item.href === "/" ? "check" : item.href.slice(1)}`}
    >
      <Led tone="key" lit={active} size="sm" />
      <Icon className="size-5" aria-hidden="true" />
      <span className="font-label text-xs font-semibold uppercase tracking-wide">{item.label}</span>
    </Link>
  );
}

function AccountTab({ pathname }: { readonly pathname: string }) {
  const user = useUser();
  return <Tab item={user ? TAB_ACCOUNT : TAB_SIGN_IN} pathname={pathname} />;
}

/** Phone navigation: three keys along the bottom edge, the active one lit. */
export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label={messages.shell.nav.tabsLabel}
      className="fixed inset-x-0 bottom-0 z-nav border-t border-line bg-surface-1 pb-(--safe-bottom) md:hidden"
      style={{ viewTransitionName: "site-tabs" }}
    >
      <div className="flex items-stretch gap-1 px-2 pt-1">
        <Tab item={TAB_CHECK} pathname={pathname} />
        <Tab item={TAB_WATCHLIST} pathname={pathname} />
        <Suspense fallback={<Tab item={TAB_SIGN_IN} pathname={pathname} />}>
          <AccountTab pathname={pathname} />
        </Suspense>
      </div>
    </nav>
  );
}
