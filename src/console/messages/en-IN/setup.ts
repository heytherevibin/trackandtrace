import type { MessageTree } from "@/messages/types";

// Word for word from docs/design/sheets/console/ConsoleSetup.dc.html. First Owner's arrival goes
// straight to step 1 (renderVals's `shown` remap), so `title`/`lead` below are its words, not
// Invite's -- Invite's own arrival (Task 2b) has its own heading, under `invite`. `expired` and
// `withdrawn` are drawn for Invite alone; both now have a caller (Task 2b, redeem-token.tsx).
export const setup = {
  // Not on a drawn sheet, same as keys.ts's title/plate/pageTitle: a short label for the browser
  // tab and the redeeming plate's header, for a moment the sheet doesn't draw.
  pageTitle: "Setup",
  form: "Form TC-03",
  title: "Set up the Trakline console",
  lead: "You'll be its first Owner. The link works once.",
  stepLegend: (step: number) => `Step ${step} of 3`,
  nameLabel: "Name this key",
  addKey: "Add key",
  touching: "Touch your key…",
  added: "Added",
  open: "Open the console",
  expired: "This invite has expired. Ask an Owner to send a new one.",
  withdrawn: "This invite was withdrawn.",
  // Invite's own arrival (Task 2b): renderVals's `heads.Invite` head, and the sheet's one action
  // and its "Link sent" status line. Not `title`/`lead` above -- those are First Owner's words,
  // and showing them to an invited member would say something false ("You'll be its first Owner").
  // The sheet's own lead line for Invite also names who invited them and their role, which needs
  // more than this call site resolves (the inviter's name); until that is wired, this shows the
  // fixed half of the sheet's head and none of the interpolated lead, rather than inventing one.
  invite: {
    title: "You're invited to the Trakline console",
    accept: "Accept and email me a sign-in link",
    sent: "Check your inbox. Open the link on the device you'll set up.",
  },
  step1: {
    heading: "Add your first key",
    lead: "A security key, or a passkey on this device. You'll add a second next, so losing one never locks you out.",
    namePlaceholder: "YubiKey 5C",
  },
  step2: {
    heading: "Add a second key",
    lead: "Use a different key, or a passkey on another device.",
    namePlaceholder: "iPhone",
    legend: (keyName: string) => `You'll tap ${keyName} first, then the new key.`,
  },
  step3: {
    heading: "You're set up",
  },
} as const satisfies MessageTree;
