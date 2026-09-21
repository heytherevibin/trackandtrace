import type { MessageTree } from "@/messages/types";

// Word for word from docs/design/sheets/console/ConsoleMyKeys.dc.html. The Sessions plate is still a
// later task, so this file does not yet carry its copy -- but task-8 adds Remove, the tap's first
// real caller, on top of the Add and Rename copy task-7 added before it.
export const myKeys = {
  title: "My keys",
  pageTitle: "My keys",
  kicker: "Your account",
  lead: "The keys you sign in with, and where you're signed in.",

  keysTitle: "Keys",
  // ConsoleMyKeys.dc.html:111's caption, visually hidden (position: absolute; ...) the same way the
  // sheet hides it -- see keys-plate.tsx's use of VisuallyHidden for the Actions column heading.
  tableCaption: "Your console keys",
  count: (n: number) => `${n} key${n === 1 ? "" : "s"}`,
  columns: {
    name: "Name",
    type: "Type",
    added: "Added",
    lastUsed: "Last used",
    actions: "Actions",
  },
  // ConsoleMyKeys.dc.html:112-114. console.key_type's two values (src/console/keys/webauthn.ts's
  // ConsoleKeyType) map to these labels here rather than in the component (task-6-brief.md).
  typeLabel: {
    security_key: "Security key",
    passkey: "Passkey",
  },
  // Not drawn: every row the sheet mocks already has a last-used date. A freshly added key genuinely
  // can have last_used_at null (set only on sign-in, never at creation -- 20260920090100 and
  // 20260920090600), so this is new copy, flagged in task-6-report.md rather than left to crash formatDate.
  neverUsed: "Never",
  legends: {
    onlyHere: "Only keys added here or during setup work for the console.",
    addStarts: "Adding a key starts with a tap of a key you already have.",
  },
  twoKeyLine: "You need at least two keys. Add another before removing one.",

  // ConsoleMyKeys.dc.html:117 (the plate's own trigger) and :166 (the dialog's h2, the same three
  // words) -- one string for both, not two that could drift apart.
  addTitle: "Add a key",
  // ConsoleMyKeys.dc.html:169-170, the dialog's own two status lines. The sheet's only drawn state
  // for this dialog is mid-ceremony (state=Adding); there is no separate "just opened" snapshot, so
  // addTitle above doubles as the dialog's idle submit label too (task-7-report.md).
  addProgress: {
    tap: "1 · Tap one of your keys: waiting…",
    register: "2 · Then touch the new key",
  },
  // ConsoleMyKeys.dc.html:112-114, the row action -- the only one of the two this task wires. There
  // is no drawn Rename dialog on this sheet (only Adding, Removing, Remove blocked, Removed, Sign
  // out others and Others signed out appear in the state script), so this same word also stands in
  // for the dialog's title and its submit button rather than inventing copy the sheet never wrote
  // (task-7-report.md).
  rename: "Rename",
  // ConsoleMyKeys.dc.html:112-114, the row action task-8 wires. The dialog it opens is the shared
  // TC-01 (src/console/components/confirm-its-you.tsx), not a My-keys-specific one -- only its own
  // drawn copy lives here.
  remove: "Remove",
  // ConsoleMyKeys.dc.html:186 -- the Remove dialog's summary sentence, a function of the key's name
  // so it reads "Remove YubiKey 5 NFC" rather than a fixed string. Composed here, not in the
  // component and not from console.action_digest's four fields (task-8-addendum.md §1): those bind
  // the tap and are never rendered, so deriving the drawn copy from them would tie the words on
  // screen to what the database hashes.
  removeSummary: (name: string) => `Remove ${name}`,
  // ConsoleMyKeys.dc.html:187 -- the Change line's label ("Keys: 3 → 2"). Only the label is copy;
  // before/after stay plain `String(n)` at the call site, because MessageTree's Leaf type
  // (@/messages/types) is `string | ((...args) => string)` and so cannot carry a function that
  // returns ConfirmItsYou's `{label, before, after}` object.
  removeChangeLabel: "Keys",

  profileTitle: "Profile",
  profile: {
    name: "Name",
    email: "Email",
    role: "Role",
    memberSince: "Member since",
  },

  lostTitle: "If you lose your keys",
  lostNote: "Another Owner can reset them. If you're the only Owner, they're reset in the Supabase dashboard, so keep your keys in different places.",
} as const satisfies MessageTree;
