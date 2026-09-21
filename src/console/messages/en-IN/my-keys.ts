import type { MessageTree } from "@/messages/types";

// Word for word from docs/design/sheets/console/ConsoleMyKeys.dc.html. Adding, renaming, removing a
// key and the Sessions plate are later tasks (task-6-addendum.md's scope line), so this file carries
// only the copy this task draws: the page header, the Keys plate (table, both legends, the two-key
// line), the Profile plate, and the "If you lose your keys" note. "Add a key" / "Rename" / "Remove"
// are not transcribed here -- the brief's quoted-copy list does not name them either.
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
