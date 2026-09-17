"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { PersonFilled, SignOutRegular } from "@/components/icons";
import { messages } from "@/messages";
import { useUser } from "@/components/session/session-provider";
import { Avatar } from "@/components/ui/avatar";
import { buttonClassName } from "@/components/ui/button";
import { MenuContent, MenuItem, MenuLinkItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { signOutEverywhere } from "@/services/auth-client";

function Placeholder() {
  return <span className="inline-block h-[32.4px] w-[96px] border border-line" aria-hidden="true" />;
}

function UserMenuInner() {
  const router = useRouter();
  const user = useUser();
  if (!user) {
    return (
      <Link href="/login" className={buttonClassName({ variant: "secondary", className: "gap-2 text-label uppercase tracking-caps" })} data-testid="sign-in">
        <PersonFilled className="size-5 shrink-0" aria-hidden="true" />
        {messages.shell.nav.signIn}
      </Link>
    );
  }
  const name = user.name ?? user.email ?? messages.shell.nav.account;
  return (
    <MenuRoot>
      <MenuTrigger className="press inline-flex border border-transparent hover:border-line" aria-label={messages.shell.nav.account} data-testid="account-menu">
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
