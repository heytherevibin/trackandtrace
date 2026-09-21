import type { MessageTree } from "@/messages/types";

// The console frame, as drawn in B0 and B2 (docs/design/sheets/console).
export const frame = {
  productName: "Trakline",
  consoleTag: "Console",
  home: "Trakline console",
  environment: {
    production: "Production",
    preview: "Preview",
    previewHost: (host: string) => `Staging data · ${host}`,
  },
  signOut: "Sign out",
  // Word for word from the AuditLog sheet's member rows (docs/design/sheets/console/AuditLog.dc.html):
  // Owner, Admin, Support, Viewer. Kept as a map so a component reads it rather than capitalising.
  roleLabel: {
    owner: "Owner",
    admin: "Admin",
    support: "Support",
    viewer: "Viewer",
  },
  // The three states Main.dc.html's `page` prop draws besides Ready and Loading (task-5-brief.md's
  // table, word for word; Main.dc.html:162-193). `noAccess.title` takes the already-resolved role
  // label (consoleMessages.frame.roleLabel[member.role]) rather than a ConsoleRole, so this file
  // stays free of the auth types -- the sheet draws it for Support only as its one example
  // (Main.dc.html:286's `who = 'Support'`); every role reads its own name here. `error` has no
  // `action`: its Retry button reuses messages.common.retry, the same label ErrorState already
  // defaults to for the three site error boundaries this one follows (task-5-addendum.md §1).
  states: {
    noAccess: {
      title: (roleLabel: string) => `This module isn't part of the ${roleLabel} role.`,
      detail: "Ask an Owner if you need it.",
      action: "Back to Overview",
    },
    error: {
      title: "This page didn't load",
      detail: "The console couldn't reach its data.",
    },
    sessionEnded: {
      title: "Your session ended",
      detail: "Sign in again to keep working.",
      action: "Sign in",
    },
    // Not drawn by any sheet: Main.dc.html's `page` prop has no not-found option, and no other
    // console sheet has one either (grepped). This wording is new, not transcribed -- flagged in
    // task-5-report.md for review. It reuses noAccess.action rather than a second "go home" string.
    notFound: {
      title: "There's nothing at this address.",
      detail: "Check the address, or go back to Overview.",
    },
  },
} as const satisfies MessageTree;
