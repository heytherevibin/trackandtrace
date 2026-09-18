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
    menu: "Menu",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    tabsLabel: "Sections",
    cta: "Check a PNR",
    sections: {
      how: "How it works",
      record: "The record",
      roadmap: "Roadmap",
      faq: "FAQ",
    },
  },
  theme: {
    label: "Theme",
    system: "System",
    light: "Day",
    dark: "Night",
    cycle: (current: string, next: string) => `Theme: ${current}. Switch to ${next}`,
  },
  footer: {
    product: "Product",
    company: "Company",
    privacy: "Privacy",
    terms: "Terms",
    copyright: (year: number) => `© ${year} Trakline`,
    sections: "Sections",
  },
  install: {
    title: "Install Trakline",
    detail: "Keep the check one tap away.",
    action: "Install",
    iosHint: "On iPhone: Share, then Add to Home Screen.",
  },
} as const satisfies MessageTree;
