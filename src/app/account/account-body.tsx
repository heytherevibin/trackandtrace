"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { Bezel, Button, Chip, PlateLabel } from "@/components/ui";
import {
  PersonRegular,
  ArrowExportRegular,
  DeleteRegular,
  EyeTrackingRegular,
  DatabaseRegular,
} from "@fluentui/react-icons";
import type { CurrentUser } from "@/lib/session";

function SignedOutView() {
  return (
    <Bezel className="mt-8">
      <div className="bezel-plate flex flex-col items-center px-6 py-14 text-center">
        <PlateLabel>Not signed in</PlateLabel>
        <h2 className="mt-3 text-xl font-semibold">Your watchlist stays on this device</h2>
        <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-steel">
          Everything works locally without an account. Sign in when you want
          the ledger synced across phones and laptops.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/login">
            <Button>Sign in</Button>
          </Link>
          <Link href="/watchlist">
            <Button variant="outline">Local watchlist</Button>
          </Link>
        </div>
      </div>
    </Bezel>
  );
}

function SignedInView({ user }: { user: CurrentUser }) {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "trackandtrace-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (res.ok) {
        await signOut({ redirectTo: "/" });
      }
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const initial = (user.name?.[0] ?? user.email?.[0] ?? "U").toUpperCase();

  return (
    <>
      <Bezel className="mt-10">
        <div className="bezel-plate p-7 sm:p-8">
          <div className="flex items-center gap-5">
            <div className="flex size-14 items-center justify-center rounded-full bg-ink-2 text-xl font-semibold text-bone ring-1 ring-(--line-2)">
              {user.image ? (
                <img src={user.image} alt="" className="size-full rounded-full object-cover" />
              ) : (
                initial
              )}
            </div>
            <div className="min-w-0">
              {user.name && (
                <p className="truncate text-[15px] font-semibold">{user.name}</p>
              )}
              {user.email && (
                <p className="truncate text-[13px] text-steel">{user.email}</p>
              )}
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => signOut({ redirectTo: "/" })}
              className="btn-press rounded-field border border-(--line) px-4 py-2 text-[12px] font-medium text-steel transition-colors hover:text-bone"
            >
              Sign out
            </button>
          </div>
        </div>
      </Bezel>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Bezel>
          <div className="bezel-plate p-7 sm:p-8">
            <PlateLabel>Synced watchlist</PlateLabel>
            <h2 className="mt-1.5 flex items-center gap-2 text-[16px] font-semibold">
              <EyeTrackingRegular className="size-[18px] text-steel/60" />
              Cross-device tracking
            </h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-steel">
              Every ticket you track follows you across devices. Re-checks accumulate
              server-side into proper movement curves.
            </p>
            <div className="mt-5">
              <Link href="/watchlist">
                <Button variant="outline" size="sm">Open watchlist</Button>
              </Link>
            </div>
          </div>
        </Bezel>
        <Bezel>
          <div className="bezel-plate p-7 sm:p-8">
            <PlateLabel>Data controls</PlateLabel>
            <h2 className="mt-1.5 flex items-center gap-2 text-[16px] font-semibold">
              <DatabaseRegular className="size-[18px] text-steel/60" />
              Export &amp; deletion
            </h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-steel">
              Your data is yours. Export your full ledger as JSON or permanently
              delete your account — no dark patterns, no lock-in.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                {exporting ? "Exporting…" : "Export ledger"}
              </Button>
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={deleting}
                className={confirmDelete ? "border-stop/60 text-stop" : ""}
              >
                {deleting
                  ? "Deleting…"
                  : confirmDelete
                    ? "Confirm deletion"
                    : "Delete account"}
              </Button>
            </div>
            {confirmDelete && (
              <p className="mt-3 text-[11px] text-stop">
                This permanently deletes your account and all data. Click again to confirm.
              </p>
            )}
          </div>
        </Bezel>
      </div>
    </>
  );
}

export function AccountBody({ user }: { user: CurrentUser | null }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-32 sm:px-6 sm:pt-40">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PlateLabel>Your journey data</PlateLabel>
          <h1 className="mt-2 text-4xl font-[800] tracking-[-0.03em] sm:text-5xl">Account</h1>
        </div>
        {user && (
          <Chip dot tone="go" size="sm">
            Signed in
          </Chip>
        )}
      </div>

      {user ? <SignedInView user={user} /> : <SignedOutView />}
    </div>
  );
}
