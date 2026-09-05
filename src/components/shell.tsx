"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import { Wordmark } from "./brand";
import { Sigil } from "./brand";
import {
  TicketDiagonalRegular,
  CalendarClockRegular,
  EyeTrackingRegular,
  GaugeRegular,
  PersonRegular,
  SignOutRegular,
} from "@fluentui/react-icons";

const NAV = [
  { href: "/", label: "Check PNR", icon: TicketDiagonalRegular },
  { href: "/pre-booking", label: "Pre-booking", icon: CalendarClockRegular },
  { href: "/watchlist", label: "Watchlist", icon: EyeTrackingRegular },
  { href: "/accuracy", label: "Accuracy", icon: GaugeRegular },
];

function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
  const pathname = usePathname();
  const active =
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-data text-[11px] font-medium uppercase tracking-[0.06em] transition-all duration-200 ${
        active
          ? "bg-bone/[0.08] text-bone shadow-[inset_0_1px_0_rgba(236,228,210,0.06)]"
          : "text-steel hover:bg-bone/[0.04] hover:text-bone/90"
      }`}
    >
      <Icon className={`size-[15px] ${active ? "text-bone/80" : "text-steel/60"}`} />
      {label}
    </Link>
  );
}

function UserNav() {
  const { data: session, status } = useSession();
  if (status === "loading") {
    return (
      <span className="inline-flex size-8 items-center justify-center rounded-full border border-bone/[0.08] bg-ink-2/50">
        <span className="block size-3 animate-pulse rounded-full bg-steel/40" />
      </span>
    );
  }
  if (session?.user) {
    const initial = (session.user.name?.[0] ?? session.user.email?.[0] ?? "U").toUpperCase();
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => signOut({ redirectTo: "/" })}
          className="btn-press hidden items-center gap-1.5 text-[12px] font-medium text-steel transition-colors hover:text-bone sm:inline-flex"
        >
          <SignOutRegular className="size-[14px]" />
          Sign out
        </button>
        <Link
          href="/account"
          className="btn-press inline-flex size-8 items-center justify-center rounded-full bg-ink-3 text-[11px] font-semibold text-bone ring-1 ring-bone/[0.1] transition-all hover:ring-bone/[0.2]"
          aria-label="Account"
        >
          {session.user.image ? (
            <img src={session.user.image} alt="" className="size-full rounded-full object-cover" />
          ) : (
            initial
          )}
        </Link>
      </div>
    );
  }
  return (
    <Link
      href="/login"
      className="btn-press inline-flex items-center gap-1.5 rounded-full bg-bone px-3.5 py-1.5 font-data text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-0 transition-all hover:bg-bone-dim sm:px-4"
    >
      <PersonRegular className="size-[14px]" />
      Sign in
    </Link>
  );
}

export function TopNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40">
      <div className="mx-auto w-full max-w-[1280px] px-3 pt-3 sm:px-5 sm:pt-4">
        <nav
          aria-label="Primary"
          className={`pointer-events-auto relative flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-2.5 backdrop-blur-2xl transition-all duration-300 sm:px-5 ${
            scrolled
              ? "border-bone/[0.07] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.7)]"
              : "border-transparent shadow-none"
          }`}
          style={{
            background: scrolled
              ? 'linear-gradient(180deg, rgba(14,17,22,0.88) 0%, rgba(8,10,14,0.92) 100%)'
              : 'transparent',
          }}
        >
          {/* Top edge highlight — only when scrolled */}
          {scrolled && (
            <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-bone/[0.08] to-transparent" aria-hidden="true" />
          )}

          {/* Brand */}
          <Link href="/" className="shrink-0 py-0.5 transition-opacity hover:opacity-80" aria-label="Track and Trace home">
            <Wordmark />
          </Link>

          {/* Desktop links */}
          <div className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.href} {...n} />
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 font-data text-[9px] tracking-[0.22em] text-watch/80 lg:inline-flex">
              <span className="led bg-watch" aria-hidden="true" />
              DEMO
            </span>
            <UserNav />
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label="Toggle menu"
              className="btn-press relative flex size-8 items-center justify-center rounded-lg text-bone md:hidden"
            >
              <span className="relative block h-3 w-4">
                <span
                  className={`absolute left-0 top-0 h-[1.5px] w-full bg-current transition-all duration-300 ${open ? "top-1/2 -translate-y-1/2 rotate-45" : ""}`}
                />
                <span
                  className={`absolute left-0 top-1/2 h-[1.5px] w-full -translate-y-1/2 bg-current transition-all duration-200 ${open ? "opacity-0" : ""}`}
                />
                <span
                  className={`absolute bottom-0 left-0 h-[1.5px] w-full bg-current transition-all duration-300 ${open ? "bottom-1/2 translate-y-1/2 -rotate-45" : ""}`}
                />
              </span>
            </button>
          </div>
        </nav>

        {/* Mobile sheet */}
        <div
          className={`pointer-events-auto mt-2 origin-top overflow-hidden rounded-xl border border-bone/[0.06] backdrop-blur-2xl transition-all duration-300 ease-out md:hidden ${
            open ? "scale-y-100 opacity-100" : "pointer-events-none scale-y-[0.96] opacity-0"
          }`}
          style={{
            transitionTimingFunction: "var(--ease-out)",
            background: 'linear-gradient(180deg, rgba(14,17,22,0.95) 0%, rgba(8,10,14,0.98) 100%)',
          }}
        >
          <div className="flex flex-col p-1.5">
            {NAV.map((n) => {
              const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 font-data text-[12px] font-medium uppercase tracking-[0.06em] transition-colors ${
                    active ? "bg-bone/[0.06] text-bone" : "text-steel hover:bg-bone/[0.03] hover:text-bone"
                  }`}
                >
                  <Icon className="size-[18px]" />
                  {n.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="relative mt-28 border-t border-(--line)" style={{ borderImage: 'linear-gradient(to right, transparent, rgba(201,162,95,0.15), transparent) 1' }}>
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-14 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Wordmark />
            <p className="mt-4 text-[12.5px] leading-relaxed text-steel">
              Journey intelligence for Indian Railways. A PNR in, an honest,
              explainable read on your seat before chart time — nothing else.
            </p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-(--line) px-2.5 py-1 font-data text-[10px] tracking-[0.18em] text-steel">
              PROVENANCE · DEMO ENGINE
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-[12.5px] sm:grid-cols-3">
            <div>
              <p className="plate-label mb-3">Product</p>
              <ul className="space-y-2 text-steel">
                <li><Link className="transition-colors hover:text-bone" href="/pre-booking">Pre-booking</Link></li>
                <li><Link className="transition-colors hover:text-bone" href="/watchlist">Watchlist</Link></li>
                <li><Link className="transition-colors hover:text-bone" href="/accuracy">Accuracy</Link></li>
              </ul>
            </div>
            <div>
              <p className="plate-label mb-3">Company</p>
              <ul className="space-y-2 text-steel">
                <li><Link className="transition-colors hover:text-bone" href="/privacy">Privacy</Link></li>
                <li><Link className="transition-colors hover:text-bone" href="/tos">Terms</Link></li>
                <li><Link className="transition-colors hover:text-bone" href="/account">Account</Link></li>
              </ul>
            </div>
            <div>
              <p className="plate-label mb-3">Status</p>
              <ul className="space-y-2 text-steel">
                <li className="inline-flex items-center gap-2">
                  <span className="led bg-watch lamp-live" aria-hidden="true" />
                  Demo engine · live data pending
                </li>
                <li className="font-data text-[11px]">IST railway time</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-(--line) pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-data text-[10px] tracking-[0.14em] text-steel/80">
            © {new Date().getFullYear()} TRACK &amp; TRACE · NOT AFFILIATED WITH IRCTC OR INDIAN RAILWAYS
          </p>
          <p className="font-data text-[10px] tracking-[0.14em] text-steel/60">
            PREDICTIONS ARE INDICATIVE · CHART IS FINAL
          </p>
        </div>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[100dvh]">
      <TopNav />
      <main className="relative">{children}</main>
      <Footer />
    </div>
  );
}

/** Registers the service worker only on production builds (https). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
