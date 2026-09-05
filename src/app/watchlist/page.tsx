"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { ArrowIcon, Button, Chip, PlateLabel } from "@/components/ui";
import { EyeTrackingRegular } from "@fluentui/react-icons";
import { MiniDial, aspectFor } from "@/components/instruments";
import { formatPnr } from "@/lib/engine";
import { clientSyntheticSource } from "@/lib/source";
import { useWatchlist } from "@/lib/store";
import type { WatchlistEntry } from "@/lib/types";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface ServerEntry {
  id: string;
  pnr: string;
  label: string;
  checks: unknown;
  createdAt: string;
  updatedAt: string;
}

export default function WatchlistPage() {
  const { entries: localEntries, remove: localRemove, upsert: localUpsert, clear: localClear } = useWatchlist();
  const { data: session, status: authStatus } = useSession();
  const isSignedIn = authStatus === "authenticated" && !!session?.user;

  const [serverEntries, setServerEntries] = useState<ServerEntry[]>([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [merged, setMerged] = useState(false);
  const [merging, setMerging] = useState(false);
  const [checking, setChecking] = useState<Set<string>>(new Set());

  const fetchServer = useCallback(async () => {
    if (!isSignedIn) return;
    setServerLoading(true);
    try {
      const res = await fetch("/api/watchlist");
      if (res.ok) {
        const json = await res.json();
        setServerEntries(json.data ?? []);
      }
    } finally {
      setServerLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    fetchServer();
  }, [fetchServer]);

  const mergeLocal = async () => {
    setMerging(true);
    try {
      const serverPnrs = new Set(serverEntries.map((e) => e.pnr));
      const toSync = localEntries.filter((e) => !serverPnrs.has(e.pnr));
      for (const entry of toSync) {
        await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pnr: entry.pnr, label: entry.label, checks: entry.checks }),
        });
      }
      await fetchServer();
      setMerged(true);
    } finally {
      setMerging(false);
    }
  };

  const removeServer = async (pnr: string) => {
    await fetch("/api/watchlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pnr }),
    });
    setServerEntries((prev) => prev.filter((e) => e.pnr !== pnr));
  };

  const entries: WatchlistEntry[] = isSignedIn
    ? serverEntries.map((e) => ({
        pnr: e.pnr,
        label: e.label,
        addedAt: e.createdAt,
        checks: Array.isArray(e.checks) ? e.checks : [],
      }))
    : localEntries;

  const removeEntry = isSignedIn ? removeServer : localRemove;

  const recheck = async (pnr: string) => {
    if (checking.has(pnr)) return;
    setChecking((s) => new Set(s).add(pnr));
    try {
      const entry = entries.find((e) => e.pnr === pnr);
      const out = await clientSyntheticSource.check(pnr, entry?.checks ?? []);
      if (out.ok) {
        const res = out.result;
        const point = {
          at: new Date().toISOString(),
          status: res.lead.status,
          position: res.lead.position,
          probability: res.prediction.probability,
        };
        const label = entry?.label ?? `${res.snapshot.train.number} · ${res.snapshot.train.from.code}→${res.snapshot.train.to.code}`;
        if (isSignedIn) {
          const existing = entries.find((e) => e.pnr === pnr);
          const checks = [...(existing?.checks ?? []), point].slice(-40);
          await fetch("/api/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pnr, label, checks }),
          });
          await fetchServer();
        } else {
          localUpsert(pnr, label, point);
        }
      }
    } finally {
      setChecking((s) => {
        const next = new Set(s);
        next.delete(pnr);
        return next;
      });
    }
  };

  const checkAll = async () => {
    for (const e of entries) await recheck(e.pnr);
  };

  const busy = checking.size > 0;
  const hasLocalToMerge = isSignedIn && !merged && localEntries.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-32 sm:px-6 sm:pt-40">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PlateLabel>{isSignedIn ? "Synced ledger · all devices" : "Local ledger · this device"}</PlateLabel>
          <h1 className="mt-2 flex items-center gap-3 text-balance text-4xl font-[800] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
            <EyeTrackingRegular className="size-8 text-steel/60 sm:size-10" />
            Watchlist
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-[1.7] text-steel-2">
            {entries.length === 0
              ? "Every read you make is recorded here automatically — re-checks compound into a movement curve."
              : `${entries.length} ticket${entries.length === 1 ? "" : "s"} under observation. Re-checks accumulate into each ticket's movement curve.`}
          </p>
        </div>
        {entries.length > 0 && (
          <Button variant="outline" onClick={checkAll} disabled={busy}>
            {busy ? "Polling ledger…" : "Check all now"}
          </Button>
        )}
      </div>

      {/* Merge callout */}
      {hasLocalToMerge && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-panel border border-go/30 bg-go/5 px-4 py-3">
          <span className="led bg-go" aria-hidden="true" />
          <p className="text-[12.5px] text-bone">
            {localEntries.length} local ticket{localEntries.length === 1 ? "" : "s"} found on this device.
          </p>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={mergeLocal} disabled={merging}>
              {merging ? "Syncing…" : "Sync to account"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMerged(true)}>
              Skip
            </Button>
          </div>
        </div>
      )}
      {merged && localEntries.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-panel border border-(--line) bg-ink-2/50 px-4 py-3">
          <span className="led bg-go" aria-hidden="true" />
          <p className="text-[12.5px] text-steel">
            Local tickets synced. Clear local storage?
          </p>
          <Button size="sm" variant="outline" className="ml-auto" onClick={localClear}>
            Clear local
          </Button>
        </div>
      )}

      {/* Account sync callout — only for anonymous users */}
      {!isSignedIn && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-panel border border-(--line) bg-ink-2/50 px-4 py-3">
          <span className="led bg-steel" aria-hidden="true" />
          <p className="text-[12.5px] text-steel">
            Stored on this device only. Sign in to sync across devices.
          </p>
          <Link href="/login" className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-bone underline-offset-4 hover:underline">
            Sign in
            <ArrowIcon size={11} />
          </Link>
        </div>
      )}

      {serverLoading && entries.length === 0 ? (
        <div className="bezel mt-10">
          <div className="bezel-plate flex items-center justify-center px-6 py-20">
            <span className="font-data text-[11px] tracking-[0.2em] text-steel">LOADING LEDGER…</span>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="bezel mt-10">
          <div className="bezel-plate flex flex-col items-center px-6 py-20 text-center">
            <svg width="54" height="54" viewBox="0 0 32 32" fill="none" aria-hidden="true" className="opacity-70">
              <circle cx="16" cy="16" r="13" stroke="var(--line-2)" strokeWidth="1.4" />
              <line x1="16" y1="16" x2="16" y2="7" stroke="var(--stop)" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="16" cy="16" r="1.5" fill="var(--bone)" />
            </svg>
            <h2 className="mt-6 text-xl font-semibold">No tickets on the clock yet</h2>
            <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-steel">
              Check any PNR once and it lands here. Come back before chart time —
              each re-check records the movement that decides your odds.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/">
                <Button>Check a PNR</Button>
              </Link>
              <Link href="/pre-booking">
                <Button variant="outline">Read before booking</Button>
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((e: WatchlistEntry) => {
            const last = e.checks[e.checks.length - 1];
            const aspect = last ? aspectFor(last.probability) : "neutral";
            const statusTxt = last
              ? last.status === "CNF"
                ? "CNF"
                : `${last.status} ${last.position ?? ""}`.trim()
              : "—";
            return (
              <article key={e.pnr} className="bezel">
                <div className="bezel-plate flex h-full flex-col p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/pnr/${e.pnr}`} className="font-data text-[17px] font-semibold text-bone hover:text-go-bright transition-colors">
                        {formatPnr(e.pnr)}
                      </Link>
                      <p className="mt-0.5 truncate text-[11px] tracking-[0.06em] text-steel">{e.label}</p>
                      <p className="mt-1.5 font-data text-[10px] tracking-[0.14em] text-steel/70">
                        {e.checks.length} CHECK{e.checks.length === 1 ? "" : "S"} · ADDED {timeAgo(e.addedAt)}
                      </p>
                    </div>
                    {last && <MiniDial value={last.probability} size={44} />}
                  </div>

                  {last ? (
                    <div className="mt-4 flex items-center justify-between rounded-field border border-(--line) bg-ink-2/70 px-3.5 py-2.5">
                      <span className="inline-flex items-center gap-2.5">
                        <span
                          className={`led ${aspect === "go" ? "bg-go" : aspect === "watch" ? "bg-watch" : aspect === "stop" ? "bg-stop" : "bg-steel"}`}
                          style={aspect !== "neutral" ? { boxShadow: `0 0 10px currentColor` } : undefined}
                        />
                        <span className="font-data text-[13px] font-semibold text-bone">{statusTxt}</span>
                      </span>
                      <span className="font-data text-[10px] tracking-[0.1em] text-steel">
                        {last.status === "CNF" ? "LOCKED" : `POLLED ${timeAgo(last.at)}`}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-field border border-(--line) bg-ink-2/70 px-3.5 py-2.5 font-data text-[10px] text-steel">
                      AWAITING FIRST READ
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-2 border-t border-(--line) pt-4">
                    <Button
                      variant={last?.status === "CNF" ? "ghost" : "primary"}
                      size="sm"
                      className="flex-1"
                      onClick={() => recheck(e.pnr)}
                      disabled={checking.has(e.pnr)}
                    >
                      {checking.has(e.pnr) ? "Polling…" : last?.status === "CNF" ? "Re-check" : "Check now"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => removeEntry(e.pnr)}
                      aria-label={`Remove ${formatPnr(e.pnr)} from watchlist`}
                      className="btn-press flex size-9 items-center justify-center rounded-full border border-(--line) text-steel transition-colors hover:border-stop/40 hover:text-stop cursor-pointer"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
                      </svg>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {entries.length > 0 && !isSignedIn && (
        <p className="mt-8 flex items-center justify-between gap-4 font-data text-[10px] tracking-[0.16em] text-steel/70">
          <span>DATA STAYS IN YOUR BROWSER</span>
          <button type="button" onClick={() => { if (window.confirm("Clear the local watchlist?")) localClear(); }} className="cursor-pointer underline-offset-2 hover:text-stop">
            CLEAR LEDGER
          </button>
        </p>
      )}
    </div>
  );
}
