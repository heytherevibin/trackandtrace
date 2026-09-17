import type { MessageTree } from "../types";

export const shell = {
  nav: {
    check: "Check",
    watchlist: "Watchlist",
    preBooking: "Pre-booking",
    accuracy: "Accuracy",
    account: "Account",
    signIn: "Sign in",
    signOut: "Sign out",
    primaryLabel: "Primary",
    tabsLabel: "Sections",
  },
  theme: {
    label: "Theme",
    system: "System",
    light: "Day",
    dark: "Night",
  },
  footer: {
    product: "Product",
    company: "Company",
    status: "Status",
    privacy: "Privacy",
    terms: "Terms",
    sourceRow: "Reservation source",
    accountsRow: "Account storage",
    connected: "Connected",
    notConnected: "Not connected",
    copyright: (year: number) => `© ${year} Track & Trace`,
  },
  install: {
    title: "Install Track & Trace",
    detail: "Keep the check one tap away.",
    action: "Install",
    iosHint: "On iPhone: Share, then Add to Home Screen.",
  },
} as const satisfies MessageTree;
