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
} as const satisfies MessageTree;
