import type { MessageTree } from "@/messages/types";
import { signIn } from "./sign-in";

// ConsoleTeam.dc.html's three team confirmations name the member twice and differently: the bold
// line takes the full name ("Change Kiran Das's role", :265) and the hint below it the first name
// alone ("Kiran is signed out everywhere at once…", :267, and the same at :291 and :316). The rule
// lives here, with the strings it governs, rather than at each call site -- the sheet is where it
// comes from, and a caller passing the wrong half is not a thing a type can catch.
const firstName = (name: string) => name.split(" ")[0];

// Word for word from docs/design/sheets/console/ConsoleTeam.dc.html, with corrections recorded in
// task-3-report.md:
//
// - The brief quoted the page kicker as "Console" and the title as "Console team". The sheet draws
//   neither: its kicker is "13 · Team" (ConsoleTeam.dc.html:99), the same "NN · Module" shape every
//   other numbered module already uses (ConsoleOverview.dc.html "01 · Overview",
//   ConsoleSwitches.dc.html "11 · Switches & settings", AuditLog.dc.html "14 · Audit log"), and its
//   title is plainly "Team" (:100). "Console" is the masthead's own tag (frame.consoleTag), already
//   shown on every console page's header -- not this page's kicker.
// - The brief's copy list never quotes the page's lead line. It exists (:101) and is included here.
// - The Members table also carries a Status column (:112) the brief's column list omits, even
//   though it separately quotes the two status values ("statuses Active and Setup incomplete") --
//   both are carried below.
export const team = {
  pageTitle: "Team",
  kicker: "13 · Team",
  title: "Team",
  lead: "Who can use the console, and with which role.",

  members: {
    title: "Members",
    // ConsoleTeam.dc.html:112's own visually-hidden caption.
    tableCaption: "Console members",
    count: (n: number) => `${n} member${n === 1 ? "" : "s"}`,
    columns: {
      name: "Name",
      email: "Email",
      role: "Role",
      keys: "Keys",
      lastActive: "Last active",
      status: "Status",
      actions: "Actions",
    },
    status: {
      active: "Active",
      setup: "Setup incomplete",
    },
    // ConsoleTeam.dc.html:141's own shape: "1 key · setup incomplete" for a member still mid-setup,
    // a plain count otherwise (:114/:126/:134 -- "2 keys", "3 keys", "2 keys").
    keysCell: (n: number, status: "active" | "setup") => `${n} key${n === 1 ? "" : "s"}${status === "setup" ? " · setup incomplete" : ""}`,
    // Not drawn: every row the sheet mocks already has a last-active moment. A member who accepted
    // an invite but never signed in with a key genuinely has no session at all, so console_team's
    // own last_active_at (max(sessions.last_seen_at)) is null for them -- new copy, flagged in
    // task-3-report.md rather than left to print "Invalid Date", the same gap keys.ts's own
    // neverUsed line closed for a key that has never been used.
    lastActiveNever: "Never",
    // ConsoleTeam.dc.html:157's own line for the Only-you state (task-3-addendum.md §1: "a console
    // with exactly one member draws its own state ... read what the sheet puts there; do not invent
    // a line"). The sheet also draws an "Invite a member" button beside it, reusing Task 4's own
    // trigger copy -- left out here on purpose: Task 4 owns that string and its dialog
    // (task-3-report.md), the same way row actions are left for Tasks 5 and 6.
    onlyYouNote: "You're the only member.",
  },

  invites: {
    title: "Pending invites",
    // ConsoleTeam.dc.html:163's own visually-hidden caption.
    tableCaption: "Invites waiting to be accepted",
    columns: {
      email: "Email",
      role: "Role",
      sent: "Sent",
      expires: "Expires",
    },
  },

  roles: {
    title: "Roles",
    tableCaption: "What each role can open",
    // ConsoleTeam.dc.html:167's own meta cell -- a fixed, real count (14 numbered modules; My keys
    // is an account page, not one of them), unlike the sheet's "Sample data" chips elsewhere, which
    // are the design tool's own placeholder and not transcribed (src/console/account/keys-plate.tsx
    // already established this: its Keys plate meta is just the count, no "Sample data" cell).
    moduleCount: "14 modules",
    columns: {
      module: "Module",
    },
    access: {
      full: "Full access",
      half: "Read-only or counts only",
      none: "No access",
    },
    // ConsoleTeam.dc.html:169-172's own four footnotes, word for word.
    notes: {
      ownersManage: "Only Owners manage the team and provider keys.",
      viewersCountOnly: "Viewers see counts only, never personal data.",
      everyMemberSignsIn: "Every member signs in with an email link and one of their keys.",
      supportScope: "Support: Overview without urgent or recent actions, Leads without export, Privacy requests without email changes.",
    },
  },

  // The four role descriptions the brief bundles with "the Roles plate", but which
  // ConsoleTeam.dc.html actually draws inside the Invite dialog's role picker (:215-218, Task 4's
  // dlg_invite), not the Roles plate's own table or footnotes -- see task-3-report.md. Authored
  // once, here, because two other surfaces need the identical words: Task 4's invite dialog, and
  // the setup/redeem page's role-specific sub-line (task-3-addendum.md §2's second gap, wired in
  // src/app/console/setup/redeem-token.tsx) -- both import this rather than growing a second copy.
  roleDescription: {
    owner: "Everything, including the team and provider keys.",
    admin: "Everything except the team and provider keys.",
    support: "Overview, Leads, Privacy requests and Wrong-status reports.",
    viewer: "Counts and service status only, never personal data.",
  },

  // Form TC-04, the Invite dialog (ConsoleTeam.dc.html:203-259, task-4). Transcribed except where
  // marked: task-4-report.md lists every authored line here, so nothing below pretends to be drawn.
  invite: {
    // The same words on two buttons: a primary in the page header's ph-actions (:106, behind
    // canManage) and a secondary beside the Only-you note (:157). Both open this dialog. Also the
    // dialog's own h2 (:205, :234).
    trigger: "Invite a member",
    form: "Form TC-04",
    emailLabel: "Email",
    roleLabel: "Role",
    hint: "The invite lasts 7 days. It can't go to an address that already has a Trakline account.",
    continue: "Continue",
    // :237, dlg_refused's alert -- the one refusal the sheet draws. It had no reachable state
    // behind it until 20260922110000_console_invite_blocks_traveller.sql added the auth.users
    // check console_invite_member was missing (task-4-addendum.md §2).
    travellerAccount: "This address already has a Trakline account. Invite a dedicated console address.",

    // Not drawn. `console_invite_member` raises three further developer strings a member must never
    // read as sent, and the sheet gives dlg_refused only the one alert above. These three fill the
    // same slot, in the same voice.
    alreadyMember: "This address already belongs to a console member.",
    // Also what a concurrent double-invite of a brand-new address lands on: both callers clear the
    // console.invites pre-check and the loser hits the live-email unique index instead
    // (task-4-addendum.md §3). One refusal, whichever way the console noticed.
    alreadyInvited: "This address already has an invite open. Resend or revoke that one instead.",
    // console.use_tap's own 'no tap for this action' -- the four fields the database re-digests
    // differ from the ones the tap was minted over. Same shape as myKeys.tapMismatch, and for the
    // same reason: it is not an outage, so it must not read as one.
    tapMismatch: "That confirmation no longer matches this invite. Try inviting them again.",
    // Referenced, not restated: the console already has one sentence for an address that is not an
    // address, and this dialog refuses one before any request goes out.
    invalidEmail: signIn.invalid,

    // Not drawn. ConsoleTeam.dc.html draws TC-01 for Change role, Reset keys and Remove (:263,
    // :288, :313) but never for the invite itself, so the confirmation's bold line and Change
    // triple are authored here in the shape those three use ("Change Kiran Das's role",
    // "Role: Support → Admin"). `before` is what the invited address has today.
    confirmSummary: (email: string) => `Invite ${email}`,
    confirmChangeLabel: "Role",
    confirmNoRole: "None",

    // Not drawn: ConsoleTeam.dc.html passes no `toast` to frame() at any call site. ConsoleMyKeys
    // and ConsoleSwitches do, in this exact shape ("Key removed · logged", "PNR checks paused ·
    // logged"), and a mutation that succeeds with no visible confirmation is a defect
    // (task-4-addendum.md §6).
    sentToast: "Invite sent · logged",
  },

  // The row menu (ConsoleTeam.dc.html:145 and :193-199) and Change role, which is TC-01 itself
  // (:259-283) -- there is no bespoke dialog for it (task-5-addendum.md §1). Transcribed except
  // where marked; task-5-report.md lists every authored line here.
  changeRole: {
    // :145's own `aria-label` on the row's trigger, and :194's own on the menu it opens -- the
    // sheet gives both the identical string, so both read it from here.
    menu: (name: string) => `Actions for ${name}`,
    // :196-198's three items, in the sheet's own order. Reset keys and Remove are Task 6's; the
    // menu draws all three from the start so it is transcribed once rather than rebuilt around
    // them later (task-5-addendum.md §5).
    trigger: "Change role",
    resetKeys: "Reset keys",
    remove: "Remove",
    // :265's own bold line -- TC-01's `summary`, and the picker's own title, which is the same act.
    title: (name: string) => `Change ${name}'s role`,
    // :266, drawn by ConfirmItsYou as `${label}: ${before} → ${after}` ("Role: Support → Admin").
    changeLabel: "Role",
    // :267, word for word. The one place the console tells an Owner that a role change signs the
    // member out everywhere, which is why TC-01 grew an optional hint rather than dropping it.
    hint: (name: string) => `${firstName(name)} is signed out everywhere at once and signs in again with the new role.`,

    // Not drawn. The sheet's `dialog` enum goes straight from Row menu to TC-01 with
    // "Support → Admin" already decided, so nothing draws how the new role is chosen
    // (task-5-addendum.md §2). These three are the picker that stands in for it, reusing the
    // invite's own radiogroup and the four descriptions above. "New role", not the invite's plain
    // "Role", because this list leaves the member's current one out.
    newRoleLabel: "New role",
    continue: "Continue",
    // Not drawn: ConsoleTeam.dc.html passes no `toast` to frame() at any call site, and a mutation
    // that succeeds with no visible confirmation is a defect. ConsoleMyKeys' own "Key removed ·
    // logged" is the shape.
    changedToast: "Role changed · logged",
    // Not drawn. console.use_tap's own 'no tap for this action' -- the four fields the database
    // re-digests differ from the ones the tap was minted over. Same shape as invite.tapMismatch and
    // myKeys.tapMismatch, and for the same reason: it is not an outage, so it must not read as one.
    tapMismatch: "That confirmation no longer matches this change. Try again.",
    // Not drawn. Every console refusal raises SQLSTATE 42501 and a developer string nobody wrote
    // for a member: 'a console needs at least one owner' (decided in the browser before any request
    // goes out, task-5-addendum.md §3), 'no access' for a member removed a moment ago, and
    // require_role's own for an Owner who was demoted in another tab. Through this console's own UI
    // every one of them means the same thing -- the roster moved underneath this page -- and this
    // says that without restating any rule, so no wording here can drift from a rule elsewhere.
    refused: "The team has changed since this page loaded. Reload it and try again.",
  },

  // dlg_owner (:334-346), a `role="alertdialog"` with a single primary button. Word for word. It is
  // drawn from the roster the page already holds, never from the database's refusal: that message
  // is a developer string, and it arrives with the same 42501 as every other refusal, so there is
  // nothing in it to tell the two apart by (task-5-addendum.md §3).
  lastOwner: {
    title: "A console needs at least one Owner",
    detail: "Make someone else Owner first.",
    ok: "OK",
  },
} as const satisfies MessageTree;
