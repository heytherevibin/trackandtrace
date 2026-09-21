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
} as const satisfies MessageTree;
