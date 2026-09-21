import type { MessageTree } from "@/messages/types";

// Word for word from docs/design/sheets/console/ConsoleMyKeys.dc.html. Removing a key and the
// Sessions plate are still later tasks, so this file does not carry "Remove" -- but task-7 adds the
// Add and Rename copy the previous task's own comment (now rewritten below) deliberately left out.
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
