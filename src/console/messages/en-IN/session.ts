import type { MessageTree } from "@/messages/types";

// Spec §5: one line for a session that ended, one for a module a role can't open.
export const session = {
  ended: "Your session ended. Sign in again.",
  noAccess: "You don't have access to this.",
  unavailable: "The console could not be reached. Try again.",
} as const satisfies MessageTree;
