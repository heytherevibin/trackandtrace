import type { MessageTree } from "../types";

// Copy transcribed from the Watchlist B sheet. Announcements carry real outcomes only.

export const watchlist = {
  title: "Watchlist",
  count: (n: number) => (n === 1 ? "1 saved" : `${n} saved`),
  anonLead: "Saved on this device. Sign in to keep it across devices.",
  signedLead: "Saved to your account.",
  syncAction: "Sign in to sync",
  plate: {
    device: "Saved PNRs — this device",
    account: "Saved PNRs — your account",
  },
  columns: { pnr: "PNR", journey: "Journey", status: "Last status", checked: "Checked", actions: "Actions" },
  noChecks: "Not checked yet",
  checksCount: (n: number) => (n === 1 ? "1 check" : `${n} checks`),
  checked: {
    justNow: "Just now",
    minutes: (n: number) => `${n} min ago`,
    hours: (n: number) => `${n} h ago`,
    yesterday: "Yesterday",
    days: (n: number) => `${n} days ago`,
  },
  recheck: "Re-check",
  checking: "Checking…",
  remove: "Remove",
  undo: "Undo remove",
  clearLocal: "Clear all on this device",
  announce: {
    same: (pnr: string, status: string, source: string) => `${pnr}: still ${status} · retrieved just now from ${source}`,
    changed: (pnr: string, from: string, to: string, source: string) => `${pnr}: ${from} → ${to} · retrieved just now from ${source}`,
    failed: (pnr: string, reason: string) => `${pnr}: not re-checked · ${reason}`,
    notSaved: (pnr: string) => `${pnr}: re-checked, but the result could not be saved to your account.`,
    removed: (pnr: string) => `Removed ${pnr}`,
    removeFailed: (pnr: string) => `${pnr} could not be removed. It is still saved.`,
    restored: "Restored",
    restoreFailed: "The entry could not be restored. Try Undo remove again.",
    cleared: "Cleared all on this device",
  },
  loadError: "Your watchlist could not be loaded.",
  empty: {
    title: "Nothing saved yet",
    detail: "Run a check and save the PNR to follow it here.",
    action: "Run a check",
  },
  sync: {
    title: "Account sync",
    anon: "Entries here live on this device only. Signing in moves them to your account — with merge and undo — so they follow you between devices.",
    anonAction: "Sign in",
    signed: "Entries here are saved to your account and follow you between devices. Entries saved on a device before you signed in are offered for a merge.",
    signedAction: "Account",
  },
  merge: {
    title: (n: number) => (n === 1 ? "Move 1 saved PNR to your account?" : `Move ${n} saved PNRs to your account?`),
    detail: "They are saved on this device only. Moving them keeps them with your account across devices.",
    move: "Move to account",
    notNow: "Not now",
    dontAsk: "Do not ask again",
    moved: (n: number) => (n === 1 ? "1 PNR moved to your account" : `${n} PNRs moved to your account`),
    failed: "The entries could not be moved. They are still on this device.",
  },
  recent: {
    title: "Recent on this device",
    clear: "Clear recent",
  },
} as const satisfies MessageTree;
