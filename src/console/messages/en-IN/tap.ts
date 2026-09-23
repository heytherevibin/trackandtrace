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
  reasonPlaceholder: "Why? This goes in the audit log.",
  reasonHint: "Don't include PNRs, emails or IP addresses; they're removed. 10–200 characters.",
  reasonShort: "Add a reason of at least 10 characters.",
  cancel: "Cancel",
  tap: "Tap your key",
  waiting: "Waiting for your key…",
  status: "Touch your security key or approve on your device",
  // TC-01's fallback when a tap comes back with nothing to show, referenced from the sign-in
  // step's copy rather than restated. There is no `notYours` here: the browser reports a wrong
  // key and a dismissed prompt as the same NotAllowedError, so the client can never raise that
  // state on its own -- the server does, and its message is shown as sent.
  didNotAnswer: keys.didNotAnswer,
  // **Not drawn**, and shared by every module that taps.
  //
  // A tap is minted over four fields and each has a length; `readBody` puts a failed schema's own
  // message in front of whoever sent it, so before this line the console answered an over-long one
  // with zod's "Too big: expected string to have <=200 characters" -- rendered straight into TC-01,
  // because `consoleApiMessage` passes a real refusal through unchanged. That is a developer string
  // in the one dialog a member is asked to trust.
  //
  // It is unreachable through any console surface (every field that feeds a tap is bounded where it
  // is typed), which is exactly why it needed writing down: the one route nobody re-read is where
  // it surfaced.
  tooLong: "The console couldn't prepare that confirmation. Narrow what you're asking for and try again.",
} as const satisfies MessageTree;
