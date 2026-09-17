"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { useUser } from "@/components/session/session-provider";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { buttonClassName } from "@/components/ui/button";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { ACCOUNT_ITEM, MINIMAL_HEADER_ROUTES, PRIMARY_NAV, SIGN_IN_ITEM, TERMINAL_ID, isActive, type NavIcon } from "./nav-config";
import { UserMenu } from "./user-menu";

const ITEM = "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-y-2 border-transparent py-1 no-underline";
const MUTED = "text-ink-1/70 hover:text-ink-1";

function ItemBody({ Icon, label }: { readonly Icon: NavIcon; readonly label: string }) {
  return (
    <>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </>
  );
}

function AccountLink() {
  const item = useUser() ? ACCOUNT_ITEM : SIGN_IN_ITEM;
  return (
    <Link href={item.href} className={cn(ITEM, MUTED)}>
      <ItemBody Icon={item.Icon} label={item.label} />
    </Link>
  );
}

/**
 * The masthead. Brand, the nav (icon and capital label on every item), the Auto · Day · Night cells,
 * and the page's action. From lg it is one sticky hairline row; below lg it is two aligned tiers,
 * brand and action on top, nav and theme cells beneath (scrolling sideways on a phone). The landing
 * lists the product pages muted with "Check a PNR"; app pages mark the current page with a steel
 * underline, with Sign in. The landing's section anchors live in the footer.
 */
export function TopNav() {
  const pathname = usePathname();
  const onLanding = pathname === "/";
  const minimal = MINIMAL_HEADER_ROUTES.includes(pathname);

  return (
    <header className={cn("border-b border-line bg-surface-0", !minimal && "sticky top-0 z-nav")} style={{ viewTransitionName: "site-header" }}>
      <div className="page-frame flex flex-wrap items-center gap-x-6">
        <Link href="/" className="mr-auto inline-flex h-16 items-center text-ink-1 no-underline hover:text-ink-1 lg:mr-2">
          <Wordmark />
        </Link>
        {minimal ? null : (
          <>
            <div className="scrollbar-none order-last flex w-full items-center justify-between gap-6 overflow-x-auto border-t border-line py-2.5 lg:order-none lg:w-auto lg:flex-1 lg:overflow-visible lg:border-t-0 lg:py-0">
              <nav aria-label={messages.shell.nav.primaryLabel} className="flex items-center gap-5 font-display text-label font-semibold uppercase tracking-caps">
                {onLanding ? (
                  <>
                    {PRIMARY_NAV.slice(1).map(({ href, label, Icon }) => (
                      <Link key={href} href={href} className={cn(ITEM, MUTED)}>
                        <ItemBody Icon={Icon} label={label} />
                      </Link>
                    ))}
                    <Suspense
                      fallback={
                        <Link href="/login" className={cn(ITEM, MUTED)}>
                          <ItemBody Icon={SIGN_IN_ITEM.Icon} label={SIGN_IN_ITEM.label} />
                        </Link>
                      }
                    >
                      <AccountLink />
                    </Suspense>
                  </>
                ) : (
                  PRIMARY_NAV.map(({ href, label, Icon }) => {
                    const active = isActive(pathname, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(ITEM, active ? "border-b-accent text-accent-text hover:text-accent-text" : MUTED)}
                      >
                        <ItemBody Icon={Icon} label={label} />
                      </Link>
                    );
                  })
                )}
              </nav>
              <ThemeToggle />
            </div>
            <div className="flex h-16 items-center">
              {onLanding ? (
                <a href={`#${TERMINAL_ID}`} className={buttonClassName({ variant: "primary" })}>
                  {messages.shell.nav.cta}
                </a>
              ) : (
                <UserMenu />
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
