import type { MessageTree } from "@/messages/types";
import { keys } from "./keys";

// Word for word from docs/design/sheets/console/Main.dc.html (Form TC-01).
// `didNotAnswer` and `notYours` are not transcribed again here -- they already exist in ./keys as
// the very same sentences this form uses, so this file references them instead of declaring a
// second copy that could drift.
// Only `reasonShort` has a caller in this task (src/console/keys/tap.ts's `tapReason`): the copy is
// transcribed once, here, and the dialog that uses the rest of this file is built next.
export const tap = {
  title: "Confirm it's you",
  form: "Form TC-01",
  changeLabel: "Change",
  reasonLabel: "Reason",
  reasonHint: "Don't include PNRs, emails or IP addresses; they're removed. 10–200 characters.",
  reasonShort: "Add a reason of at least 10 characters.",
  cancel: "Cancel",
  tap: "Tap your key",
  waiting: "Waiting for your key…",
  status: "Touch your security key or approve on your device",
  didNotAnswer: keys.didNotAnswer,
  notYours: keys.notYours,
} as const satisfies MessageTree;
