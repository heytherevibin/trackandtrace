import type { MessageTree } from "@/messages/types";

// Word for word from docs/design/sheets/console/ConsoleMyKeys.dc.html. task-8 added Remove, the
// tap's first real caller, on top of the Add and Rename copy task-7 added before it; task-9 adds
// the Sessions plate and the two toasts the sheet's own state script draws
// (`st === 'Removed' ? 'Key removed · logged' : st === 'Others signed out' ? 'Other sessions
// signed out · logged' : ''`) -- the second half of each ternary was undrawn in code until this
// task mounted a toaster (task-9-addendum.md §1).
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
  // Authored, not transcribed: no sheet draws this state. console.use_tap raises 'no tap for this
  // action' whenever the four fields it re-digests differ from the ones the tap was minted over --
  // in practice a key count that moved under the member (another device removed a key, or added
  // one) between opening the dialog and confirming it. That used to fall through to "The console
  // could not be reached", which was untrue about a console that had just answered, so this says
  // the true thing instead: the confirmation no longer describes this removal, and a fresh one
  // will. The plate re-reads the list on this refusal, so the retry it invites can actually work.
  tapMismatch: "That confirmation no longer matches this key. Try removing it again.",

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
  // The sheet's own state script, state=Removed: `'Key removed · logged'`. The previous task left
  // this undrawn since nothing mounted a toaster yet (task-8-report.md); task-9 mounts one
  // (task-9-addendum.md §1) and this is the one line that was waiting on it.
  removedToast: "Key removed · logged",

  profileTitle: "Profile",
  profile: {
    name: "Name",
    email: "Email",
    role: "Role",
    memberSince: "Member since",
  },

  lostTitle: "If you lose your keys",
  lostNote: "Another Owner can reset them. If you're the only Owner, they're reset in the Supabase dashboard, so keep your keys in different places.",

  // ConsoleMyKeys.dc.html:137-144, the sheet's right-hand column (task-9). sessionsTitle sits
  // beside keysTitle/profileTitle above rather than inside the nested object below, the same split
  // that block already draws between a plate's own title and its field labels.
  sessionsTitle: "Sessions",
  sessions: {
    // ConsoleMyKeys.dc.html:140's own tag text.
    thisDevice: "This device",
    // The sheet draws the two rows differently, and the difference is the point:
    // ConsoleMyKeys.dc.html:140 "Chrome on macOS · signed in 09:12 IST" for the device you are on,
    // :142 "Safari on iPhone · last seen yesterday, 22:40 IST" for one you are not. For this device
    // you already know you are here, so when the session started is what there is to say; for
    // another, how recently it was used is the thing that decides whether to sign it out.
    //
    // task-9-brief.md gave one template for both rows and task-9 followed it, flagging the
    // conflict rather than silently choosing -- correctly, since the sheet is the authority and
    // the brief was mine. `when` arrives pre-formatted ("09:12 IST", "yesterday, 22:40 IST") from
    // sessions-plate.tsx, so this file does not duplicate that formatting or the word "IST".
    row: (device: string, when: string) => `${device} · signed in ${when}`,
    otherRow: (device: string, when: string) => `${device} · last seen ${when}`,
    // ConsoleMyKeys.dc.html:143's trigger.
    signOutOthers: "Sign out other sessions",
    // ConsoleMyKeys.dc.html:208, the confirm dialog's own h2.
    confirmTitle: "Sign out other sessions?",
    // ConsoleMyKeys.dc.html:209: "Safari on iPhone is signed out at once. This device stays signed
    // in." -- built from the list rather than hardcoded (task-9-brief.md), so a member with more
    // than one other session reads exactly which ones are about to go: this is not a state the
    // sheet draws, so the plural join and subject-verb agreement below are new, undrawn copy this
    // task adds rather than transcribes.
    confirmBody: (devices: readonly string[]) => {
      const named = devices.length <= 2 ? devices.join(" and ") : `${devices.slice(0, -1).join(", ")}, and ${devices[devices.length - 1]}`;
      const verb = devices.length === 1 ? "is" : "are";
      return `${named} ${verb} signed out at once. This device stays signed in.`;
    },
    // ConsoleMyKeys.dc.html:212. Cancel is ConfirmDialog's own default (messages.common.cancel,
    // "Cancel") everywhere else it's used, but the console keeps its own copy of every string it
    // shows rather than reaching into the traveller tree for one (the same call frame-signed-in.ts
    // makes for "IST", and the boundary this file's own header note assumes:
    // tests/unit/console/boundary.contract.test.ts checks the other direction, but nothing here
    // relies on that -- this string is passed explicitly rather than left to ConfirmDialog's
    // default).
    cancel: "Cancel",
    // ConsoleMyKeys.dc.html:212.
    confirmConfirm: "Sign out others",
    // The sheet's own state script, state='Others signed out': `'Other sessions signed out ·
    // logged'` -- the toast's other half, same story as removedToast above.
    signedOutToast: "Other sessions signed out · logged",
  },
} as const satisfies MessageTree;
