import type { MessageTree } from "@/messages/types";

// Word for word from docs/design/sheets/console/ConsoleSetup.dc.html. This PR wires up the First
// Owner entry only: its arrival goes straight to step 1 (renderVals's `shown` remap), so there is
// no inbox state here, unlike Invite. `expired` and `withdrawn` are both drawn for Invite too;
// `withdrawn` has no caller yet -- Team (2d) is what can withdraw one.
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
