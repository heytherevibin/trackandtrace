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
      reliability: "Reliability",
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
    /** The menu drawer's row (v4): "Theme · Day" beside its switch. */
    row: (current: string) => `Theme · ${current}`,
  },
  /** Neubrutal v4 shell copy. */
  brandHome: "Trakline, home",
  menuDisclaimer: "Not affiliated with IRCTC or Indian Railways.",
  offline: "Offline. Results cannot be fetched until the connection returns.",
  tabs: {
    check: "Check",
    watchlist: "Watchlist",
    preBooking: "Pre-booking",
    menu: "Menu",
  },
  footer: {
    product: "Product",
    company: "Company",
    privacy: "Privacy",
    terms: "Terms",
    copyright: (year: number) => `© ${year} Trakline`,
    sections: "Sections",
    motion: "Motion",
    motionByDevice: "Your device asks for reduced motion",
    sound: "Sound",
  },
  install: {
    title: "Install Trakline",
    meta: "PWA",
    detail: "Keep the check one tap away for the days you re-check the same ticket before the chart.",
    action: "Install",
    later: "Not now",
    iosHint: "On iPhone: Share, then Add to Home Screen.",
  },
  /** Notices.dc.html, SITE NOTICE STRIP. The text itself is the console's. */
  siteNotice: {
    label: "Site notice",
    close: "Close this notice",
  },
} as const satisfies MessageTree;
