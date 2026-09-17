"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { PRIMARY_NAV, isActive } from "./nav-config";
import { UserMenu } from "./user-menu";

/** A floating instrument rail: detached from the edge, blurred plate, lit key for the active section. */
export function TopNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-nav" style={{ viewTransitionName: "site-header" }}>
      <div className="mx-auto w-full max-w-page px-3 pt-3 sm:px-6">
        <nav
          aria-label={messages.shell.nav.primaryLabel}
          className={cn(
            "flex h-14 items-center justify-between gap-3 rounded-lg border border-line bg-surface-1/85 px-3 backdrop-blur-md transition-shadow duration-(--duration-base) sm:gap-4 sm:px-4",
            scrolled ? "shadow-2 border-line-strong" : "shadow-1",
          )}
        >
          <Link href="/" className="shrink-0 rounded-md" aria-label={messages.common.productName}>
            <Wordmark compact hideNameOnMobile />
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            {PRIMARY_NAV.map(({ href, label, Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "press inline-flex h-9 items-center gap-2 rounded-md px-3 font-label text-sm font-semibold uppercase tracking-wide transition-colors",
                    active ? "bg-surface-sunken text-ink-1 shadow-key-pressed" : "text-ink-2 hover:bg-surface-2 hover:text-ink-1",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                  <span className={cn("led size-1.5", active && "led-key")} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <span className="hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
            <UserMenu />
          </div>
        </nav>
      </div>
    </header>
  );
}
