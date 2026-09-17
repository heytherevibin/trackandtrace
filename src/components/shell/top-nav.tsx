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
import { LANDING_SECTIONS, MINIMAL_HEADER_ROUTES, PRIMARY_NAV, TERMINAL_ID, isActive } from "./nav-config";
import { UserMenu } from "./user-menu";

const NAV = "flex flex-wrap items-center gap-4 font-display text-label font-semibold uppercase tracking-caps";
const MUTED = "text-ink-1/70 no-underline hover:text-ink-1/70";

function AccountLink() {
  const user = useUser();
  return (
    <Link href={user ? "/account" : "/login"} className={MUTED}>
      {user ? messages.shell.nav.account : messages.shell.nav.signIn}
    </Link>
  );
}

/**
 * The masthead, as the B sheets draw it: a sticky hairline bar that wraps. The landing lists
 * its sections in steel, then the product pages muted, with "Check a PNR" on the right. App
 * pages list the product with a steel underline on the current one, and "Sign in" on the
 * right. Sign in shows the brand and the theme cells only.
 */
export function TopNav() {
  const pathname = usePathname();
  const onLanding = pathname === "/";
  const minimal = MINIMAL_HEADER_ROUTES.includes(pathname);

  return (
    <header className={cn("border-b border-line bg-surface-0", !minimal && "sticky top-0 z-nav")} style={{ viewTransitionName: "site-header" }}>
      <div className="page-frame flex min-h-16 flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/" className={cn("inline-flex items-center text-ink-1 no-underline hover:text-ink-1", minimal ? "mr-auto" : "mr-2")}>
          <Wordmark />
        </Link>
        {minimal ? null : onLanding ? (
          <nav aria-label={messages.shell.nav.primaryLabel} className={NAV}>
            {LANDING_SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="no-underline">
                {s.label}
              </a>
            ))}
            <span aria-hidden="true" className="h-4 w-px bg-line" />
            {PRIMARY_NAV.slice(1).map(({ href, label }) => (
              <Link key={href} href={href} className={MUTED}>
                {label}
              </Link>
            ))}
            <Suspense
              fallback={
                <Link href="/login" className={MUTED}>
                  {messages.shell.nav.signIn}
                </Link>
              }
            >
              <AccountLink />
            </Suspense>
          </nav>
        ) : (
          <nav aria-label={messages.shell.nav.primaryLabel} className={NAV}>
            {PRIMARY_NAV.map(({ href, label }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("no-underline", active ? "border-b-2 border-accent text-accent-text hover:text-accent-text" : MUTED)}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        )}
        <div className={cn("flex items-center gap-3", !minimal && "ml-auto")}>
          <ThemeToggle />
          {minimal ? null : onLanding ? (
            <a href={`#${TERMINAL_ID}`} className={buttonClassName({ variant: "primary" })}>
              {messages.shell.nav.cta}
            </a>
          ) : (
            <UserMenu />
          )}
        </div>
      </div>
    </header>
  );
}
