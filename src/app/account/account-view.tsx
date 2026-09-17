"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDownloadRegular, DeleteRegular, SignOutRegular } from "@/components/icons";
import { PRIMARY_NAV } from "@/components/shell/nav-config";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { notify } from "@/components/ui/toast";
import { messages } from "@/messages";
import { signOutEverywhere } from "@/services/auth-client";
import type { SessionUser } from "@/types/session";
import { DeleteAccountDialog } from "./delete-account-dialog";

export function AccountView({ user, savedCount }: { readonly user: SessionUser | null; readonly savedCount: number }) {
  const m = messages.account;
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const exportJson = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/account/export", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "trackandtrace-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      notify.error(m.data.exportFailed);
    } finally {
      setExporting(false);
    }
  };

  if (!user) {
    return (
      <section className="mx-auto w-full max-w-page px-4 py-8 sm:px-6">
        <PageHeader title={m.title} />
        <EmptyState
          className="mt-8"
          title={m.signedOut.title}
          detail={m.signedOut.detail}
          actions={
            <>
              <Link href="/login" className={buttonClassName({ variant: "primary" })}>
                {m.signedOut.signIn}
              </Link>
              <Link href="/watchlist" className={buttonClassName({ variant: "secondary" })}>
                {m.signedOut.openLocal}
              </Link>
            </>
          }
        />
      </section>
    );
  }

  const name = user.name ?? user.email ?? m.title;
  return (
    <section className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader title={m.title} />
      <Panel legend={m.profile.legend} legendId="profile-legend">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={name} src={user.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-medium">{name}</p>
            {user.email && user.name ? <p className="truncate text-sm text-ink-2">{user.email}</p> : null}
          </div>
          <Button variant="secondary" size="sm" leadingIcon={<SignOutRegular className="size-4" aria-hidden="true" />} onClick={() =>
              void signOutEverywhere().then(() => {
                router.push("/");
                router.refresh();
              })
            }
          >
            {m.profile.signOut}
          </Button>
        </div>
      </Panel>
      <div className="grid gap-6 md:grid-cols-2">
        <Panel legend={m.watchlist.legend} legendId="watchlist-legend">
          <p className="text-ink-2">{m.watchlist.saved(savedCount)}</p>
          <Link href="/watchlist" className={buttonClassName({ variant: "secondary", size: "sm", className: "mt-4" })}>
            {m.watchlist.open}
          </Link>
        </Panel>
        <Panel legend={m.preferences.legend} legendId="preferences-legend">
          <p className="silk">{m.preferences.theme}</p>
          <ThemeToggle showLabels className="mt-2" />
        </Panel>
      </div>
      <Panel legend={m.data.legend} legendId="data-legend">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={exporting} leadingIcon={<ArrowDownloadRegular className="size-4" aria-hidden="true" />} onClick={() => void exportJson()}>
            {exporting ? m.data.exporting : m.data.export}
          </Button>
          <Button variant="danger" leadingIcon={<DeleteRegular className="size-4" aria-hidden="true" />} onClick={() => setDeleteOpen(true)}>
            {m.data.delete}
          </Button>
        </div>
      </Panel>
      <Panel legend={m.more.legend} legendId="more-legend" className="md:hidden">
        <ul className="flex flex-col gap-2 text-sm">
          {PRIMARY_NAV.slice(2).map(({ href, label }) => (
            <li key={href}>
              <Link href={href} className="text-ink-2 hover:text-ink-1">
                {label}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/privacy" className="text-ink-2 hover:text-ink-1">
              {messages.shell.footer.privacy}
            </Link>
          </li>
          <li>
            <Link href="/tos" className="text-ink-2 hover:text-ink-1">
              {messages.shell.footer.terms}
            </Link>
          </li>
        </ul>
      </Panel>
      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </section>
  );
}
