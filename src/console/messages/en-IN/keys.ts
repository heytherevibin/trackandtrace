import type { MessageTree } from "@/messages/types";

// Word for word from docs/design/sheets/console/ConsoleSetup.dc.html and Main.dc.html.
export const keys = {
  // None of title/plate/pageTitle is on a drawn sheet: the Setup sheet's "One key only" entry
  // ("Console setup" / "Tap your first key, then add a second.") is a different moment --
  // registering a first key during setup, not signing in with one already held. 2d may replace
  // all three once the signed-in frame lands and a real destination for this page exists.
  title: "Your key",
  plate: "Security key",
  pageTitle: "Your key",
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

  // Not drawn. ConsoleSetup.dc.html and ConsoleMyKeys.dc.html:117 both draw one Add key button and
  // no chooser at all, so every string below is authored rather than transcribed. It exists because
  // with no preference on the registration options the browser picks its own sheet, and Safari's
  // picks iCloud Keychain and never offers the security-key path -- so the member says which they
  // are adding, and the console asks the browser for that one (src/console/keys/kind.ts).
  //
  // The two labels are the sheets' own words for these two things rather than a third vocabulary:
  // "Security key" is ConsoleMyKeys.dc.html:112's Type cell, "This device" is :140's session tag.
  // The legend and the two notes under the labels have no drawn source of any kind.
  kindLabel: "What kind of key?",
  kind: {
    securityKey: {
      label: "Security key",
      // "plug in or tap" covers USB and NFC without naming a make; the sheets' own placeholders
      // already say "YubiKey 5C", so naming one here is the sheets' register, not a new claim.
      note: "One you plug in or tap, like a YubiKey.",
    },
    thisDevice: {
      // ConsoleSetup.dc.html:94 calls this "a passkey on this device", and ConsoleMyKeys.dc.html:114
      // files one under the Passkey type -- so the note says "passkey" and the label says where it
      // lives, which is the half the member is actually choosing between.
      label: "This device",
      note: "A passkey saved on this computer or phone.",
    },
  },
} as const satisfies MessageTree;
