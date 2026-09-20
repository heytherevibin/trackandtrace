"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClassName } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { Plate } from "@/components/ui/plate";
import { notify } from "@/components/ui/toast";
import { messages } from "@/messages";
import { signOutEverywhere } from "@/services/auth-client";
import type { SessionUser } from "@/types/session";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { PasskeysPlate } from "./passkeys-plate";

// Account is not drawn on its own sheet. It is built from the B sheets' grammar:
// the app title block, the empty plate (Watchlist), and title-block plates (10×20 cells).

const DETAIL = "text-body text-ink-1/78";

function TitleBlock({ title }: { readonly title: string }) {
  return (
    <div className="max-w-[60ch]">
      <h1 className="optical-hang text-page tracking-display">{title}</h1>
    </div>
  );
}

function SignedOut() {
  const m = messages.account;
  return (
    <section className="page-frame page-body">
      <TitleBlock title={m.title} />
      <div className="blueprint mt-8 p-[clamp(28px,4vw,48px)]">
        <Corners />
        <h2 className="text-3xl leading-[1.12] tracking-head">{m.signedOut.title}</h2>
        <p className={`mt-3 max-w-[52ch] ${DETAIL}`}>{m.signedOut.detail}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/login" className={buttonClassName({ variant: "primary" })}>
            {m.signedOut.signIn}
          </Link>
          <Link href="/watchlist" className={buttonClassName({ variant: "secondary" })}>
            {m.signedOut.openLocal}
          </Link>
        </div>
      </div>
    </section>
  );
}

export function AccountView({ user, savedCount, passkeys = false }: { readonly user: SessionUser | null; readonly savedCount: number; readonly passkeys?: boolean }) {
  const m = messages.account;
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!user) return <SignedOut />;

  const exportJson = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/account/export", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "trakline-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      notify.error(m.data.exportFailed);
    } finally {
      setExporting(false);
    }
  };

  const signOut = () =>
    void signOutEverywhere().then(() => {
      router.push("/");
      router.refresh();
    });

  const name = user.name ?? user.email ?? m.title;
  return (
    <section className="page-frame page-body">
      <TitleBlock title={m.title} />

      <Plate className="mt-8" title={m.profile.legend} titleId="account-profile" headingLevel={2} cells="tight">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={name} src={user.avatarUrl} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium">{name}</p>
            {user.email && user.name ? <p className="truncate text-sm text-ink-1/74">{user.email}</p> : null}
          </div>
          <Button variant="secondary" onClick={signOut}>
            {m.profile.signOut}
          </Button>
        </div>
      </Plate>

      <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-8">
        <Plate title={m.watchlist.legend} titleId="account-watchlist" headingLevel={2} cells="tight" meta={[m.watchlist.count(savedCount)]}>
          <p className={DETAIL}>{m.watchlist.saved(savedCount)}</p>
          <Link href="/watchlist" className={buttonClassName({ variant: "secondary", className: "mt-4" })}>
            {m.watchlist.open}
          </Link>
        </Plate>
        <Plate title={m.preferences.legend} titleId="account-preferences" headingLevel={2} cells="tight">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-display text-label font-semibold uppercase leading-normal tracking-caps text-accent-text">{m.preferences.theme}</span>
            <ThemeToggle />
          </div>
        </Plate>
      </div>

      {passkeys ? <PasskeysPlate /> : null}

      <Plate className="mt-8" title={m.data.legend} titleId="account-data" headingLevel={2} cells="tight">
        <p className="max-w-[64ch] text-sm text-ink-1/74">{m.data.detail}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" aria-busy={exporting || undefined} onClick={() => void exportJson()}>
            {exporting ? m.data.exporting : m.data.export}
          </Button>
          <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
            {m.data.delete}
          </Button>
        </div>
      </Plate>

      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </section>
  );
}
