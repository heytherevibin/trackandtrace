import type { MessageTree } from "../types";

// Service status as travellers see it: what they use, and whether it works. Nothing internal.
export const service = {
  label: "Service status",
  overall: {
    operational: "All systems operational",
    partial: "Some services are unavailable",
    down: "Services are unavailable",
  },
  components: { checks: "PNR checks", accounts: "Accounts and watchlist sync" },
  states: { operational: "Operational", unavailable: "Unavailable" },
  checksLine: { operational: "PNR checks operational", unavailable: "PNR checks unavailable" },
} as const satisfies MessageTree;
