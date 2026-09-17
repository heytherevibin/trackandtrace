"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
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
      className={cn(
        "press relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 no-underline",
        active ? "text-accent-text hover:text-accent-text" : "text-ink-3 hover:text-ink-1",
      )}
      data-testid={`tab-${item.href === "/" ? "check" : item.href.slice(1)}`}
    >
      <span aria-hidden="true" className={cn("absolute inset-x-5 top-0 h-0.5", active ? "bg-accent" : "bg-transparent")} />
      <Icon className="size-5" aria-hidden="true" />
      <span className="caps text-2xs">{item.label}</span>
    </Link>
  );
}

function AccountTab({ pathname }: { readonly pathname: string }) {
  const user = useUser();
  return <Tab item={user ? TAB_ACCOUNT : TAB_SIGN_IN} pathname={pathname} />;
}

/** Phone navigation: three cells along the bottom edge behind a hairline; the current one carries a steel rule. */
export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label={messages.shell.nav.tabsLabel}
      className="fixed inset-x-0 bottom-0 z-nav border-t border-line bg-surface-0 pb-(--safe-bottom) md:hidden"
      style={{ viewTransitionName: "site-tabs" }}
    >
      <div className="flex items-stretch divide-x divide-line">
        <Tab item={TAB_CHECK} pathname={pathname} />
        <Tab item={TAB_WATCHLIST} pathname={pathname} />
        <Suspense fallback={<Tab item={TAB_SIGN_IN} pathname={pathname} />}>
          <AccountTab pathname={pathname} />
        </Suspense>
      </div>
    </nav>
  );
}
