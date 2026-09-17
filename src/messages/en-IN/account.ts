import type { MessageTree } from "../types";

export const account = {
  title: "Account",
  signedOut: {
    title: "Nothing to sync yet",
    detail: "Checking works without an account. Sign in only to keep your watchlist across devices.",
    signIn: "Sign in",
    openLocal: "Open the device watchlist",
  },
  profile: { legend: "Profile", signOut: "Sign out" },
  watchlist: {
    legend: "Watchlist",
    saved: (n: number) => (n === 1 ? "1 PNR saved to this account" : `${n} PNRs saved to this account`),
    open: "Open watchlist",
  },
  preferences: { legend: "Preferences", theme: "Theme" },
  data: {
    legend: "Your data",
    export: "Export JSON",
    exporting: "Preparing",
    exportFailed: "The export could not be prepared.",
    delete: "Delete account",
    deleteTitle: "Delete this account?",
    deleteDetail: "Your account and every PNR saved on it are removed. Records on this device are not touched. This cannot be undone.",
    deleteAck: "I understand this cannot be undone",
    deleteConfirm: "Delete my account",
    deleted: "Your account was deleted.",
    deleteFailed: "The account could not be deleted. Nothing was changed.",
  },
  more: { legend: "More" },
} as const satisfies MessageTree;
