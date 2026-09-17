"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { SignOutRegular } from "@/components/icons";
import { messages } from "@/messages";
import { useUser } from "@/components/session/session-provider";
import { Avatar } from "@/components/ui/avatar";
import { buttonClassName } from "@/components/ui/button";
import { MenuContent, MenuItem, MenuLinkItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { signOutEverywhere } from "@/services/auth-client";

function Placeholder() {
  return <span className="hidden h-9 w-16 border border-line sm:inline-block" aria-hidden="true" />;
}

function UserMenuInner() {
  const router = useRouter();
  const user = useUser();
  if (!user) {
    return (
      <Link href="/login" className={buttonClassName({ variant: "secondary", className: "hidden sm:inline-flex" })} data-testid="sign-in">
        {messages.shell.nav.signIn}
      </Link>
    );
  }
  const name = user.name ?? user.email ?? messages.shell.nav.account;
  return (
    <MenuRoot>
      <MenuTrigger className="press hidden border border-transparent hover:border-line sm:inline-flex" aria-label={messages.shell.nav.account} data-testid="account-menu">
        <Avatar name={name} src={user.avatarUrl} size="sm" />
      </MenuTrigger>
      <MenuContent>
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium text-ink-1">{name}</p>
          {user.email && user.name ? <p className="truncate text-label text-ink-3">{user.email}</p> : null}
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
