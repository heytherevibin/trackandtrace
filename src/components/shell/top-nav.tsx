"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { buttonClassName } from "@/components/ui/button";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { LANDING_SECTIONS, MINIMAL_HEADER_ROUTES, PRIMARY_NAV, TERMINAL_ID, isActive } from "./nav-config";
import { UserMenu } from "./user-menu";

const LINK = "caps whitespace-nowrap py-1 text-label no-underline";

/** The masthead: a sticky hairline bar. The landing lists its sections; app pages mark where you are. */
export function TopNav() {
  const pathname = usePathname();
  const onLanding = pathname === "/";
  const minimal = MINIMAL_HEADER_ROUTES.includes(pathname);

  return (
    <header className="sticky top-0 z-nav border-b border-line bg-surface-0" style={{ viewTransitionName: "site-header" }}>
      <div className="page-frame flex min-h-16 flex-wrap items-center gap-x-5 gap-y-1">
        <Link href="/" className="mr-2 shrink-0 py-3 text-ink-1 no-underline hover:text-ink-1">
          <Wordmark />
        </Link>
        {!minimal ? (
          <nav
            aria-label={messages.shell.nav.primaryLabel}
            className={cn("order-last hidden w-full flex-wrap items-center gap-x-4 gap-y-1 pb-2 md:flex", onLanding ? "xl:order-none xl:w-auto xl:pb-0" : "lg:order-none lg:w-auto lg:pb-0")}
          >
            {onLanding ? (
              <>
                {LANDING_SECTIONS.map((s) => (
                  <a key={s.id} href={`#${s.id}`} className={cn(LINK, "text-accent-text hover:text-accent-soft-ink")}>
                    {s.label}
                  </a>
                ))}
                <span aria-hidden="true" className="h-4 w-px bg-line" />
                {PRIMARY_NAV.slice(1).map(({ href, label }) => (
                  <Link key={href} href={href} className={cn(LINK, "text-ink-3 hover:text-ink-1")}>
                    {label}
                  </Link>
                ))}
              </>
            ) : (
              PRIMARY_NAV.map(({ href, label }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(LINK, "border-b-2", active ? "border-accent text-accent-text hover:text-accent-text" : "border-transparent text-ink-3 hover:text-ink-1")}
                  >
                    {label}
                  </Link>
                );
              })
            )}
          </nav>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          {!minimal ? <UserMenu /> : null}
          {onLanding ? (
            <a href={`#${TERMINAL_ID}`} className={buttonClassName({ variant: "primary", className: "hidden sm:inline-flex" })}>
              {messages.shell.nav.cta}
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
