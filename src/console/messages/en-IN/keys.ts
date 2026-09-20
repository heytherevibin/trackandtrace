import type { MessageTree } from "@/messages/types";

// Word for word from docs/design/sheets/console/ConsoleSetup.dc.html and Main.dc.html.
export const keys = {
  didNotAnswer: "That key didn't answer. Try again.",
  notYours: "This key isn't one of yours.",
  alreadyAdded: "That key is already added. Use a different one.",
  unsupported: "This browser can't use security keys. Try a current Chrome, Safari, Edge or Firefox.",
} as const satisfies MessageTree;
