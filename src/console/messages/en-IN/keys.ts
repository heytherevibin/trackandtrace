import type { MessageTree } from "@/messages/types";

// Word for word from docs/design/sheets/console/ConsoleSetup.dc.html and Main.dc.html.
export const keys = {
  // Not on a drawn sheet: the Setup sheet's "One key only" entry ("Console setup" / "Tap your
  // first key, then add a second.") is a different moment -- registering a first key during setup,
  // not signing in with one already held. 2d may replace this pairing once the signed-in frame
  // lands and a real destination for "Your key" exists.
  title: "Your key",
  lead: "Tap your key to finish signing in.",
  form: "Form TC-03",
  waiting: "Waiting for your key…",
  tap: "Tap your key",
  touching: "Touch your key…",
  status: "Touch your security key or approve on your device",
  didNotAnswer: "That key didn't answer. Try again.",
  notYours: "This key isn't one of yours.",
  alreadyAdded: "That key is already added. Use a different one.",
  unsupported: "This browser can't use security keys. Try a current Chrome, Safari, Edge or Firefox.",
  noKeysYet: "Add a security key before signing in with one.",
  nameLabel: "Name this key",
  addKey: "Add key",
} as const satisfies MessageTree;
