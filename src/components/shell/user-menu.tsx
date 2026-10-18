"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { SignOutRegular } from "@/components/icons";
import { messages } from "@/messages";
import { useUser } from "@/components/session/session-provider";
import { EmailText } from "@/components/ui/email-text";
import { MenuContent, MenuItem, MenuLinkItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { signOutEverywhere } from "@/services/auth-client";
import { cn } from "@/utils/cn";
import { MASTHEAD_KEY } from "./nav-config";

/** v4's signed-out avatar: a person, 20px, drawn in the key's ink. */
function Person() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="block">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function Placeholder() {
  return <span className={cn(MASTHEAD_KEY, "pointer-events-none")} aria-hidden="true" />;
}

/**
 * The masthead's 40px sign-in key (v4 .mh-avatar). Signed out, a person that leads to sign in. Signed in, the initial
 * in Archivo Black on pink, which keeps the account menu (the owner, 2026-10-18): Account, Watchlist, Sign out.
 */
function UserMenuInner() {
  const router = useRouter();
  const user = useUser();
  if (!user) {
    return (
      <Link href="/login" aria-label={messages.shell.nav.signIn} title={messages.shell.nav.signIn} className={MASTHEAD_KEY} data-testid="sign-in">
        <Person />
      </Link>
    );
  }
  const name = user.name ?? user.email ?? messages.shell.nav.account;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <MenuRoot>
      <MenuTrigger className={cn(MASTHEAD_KEY, "bg-pink text-on-fill")} aria-label={messages.shell.nav.account} title={messages.shell.nav.account} data-testid="account-menu">
        <span aria-hidden="true" className="font-display text-sm leading-4">
          {initial}
        </span>
      </MenuTrigger>
      <MenuContent>
        {/* Wrapped, never cut short: the popup holds to the window (menu.tsx), and these lines wrap inside it. */}
        <div className="px-3 py-2">
          <p className="wrap-break-word text-sm font-medium text-ink-1">{name}</p>
          {user.email && user.name ? (
            <p className="font-figure text-xs text-ink-3">
              <EmailText email={user.email} />
            </p>
          ) : null}
        </div>
        <MenuSeparator />
        <MenuLinkItem render={<Link href="/account" />}>{messages.shell.nav.account}</MenuLinkItem>
        <MenuLinkItem render={<Link href="/watchlist" />}>{messages.shell.nav.watchlist}</MenuLinkItem>
        <MenuSeparator />
        <MenuItem
          onClick={() =>
            void signOutEverywhere().then(() => {
              router.push("/");
              router.refresh();
            })
          }
        >
          <SignOutRegular className="size-4" aria-hidden="true" />
          {messages.shell.nav.signOut}
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
}

export function UserMenu() {
  return (
    <Suspense fallback={<Placeholder />}>
      <UserMenuInner />
    </Suspense>
  );
}
