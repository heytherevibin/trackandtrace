import type { MessageTree } from "@/messages/types";
import { signIn } from "./sign-in";

// ConsoleTeam.dc.html's three team confirmations name the member twice and differently: the bold
// line takes the full name ("Change Kiran Das's role", :265) and the hint below it the first name
// alone ("Kiran is signed out everywhere at once…", :267, and the same at :291 and :316). The rule
// lives here, with the strings it governs, rather than at each call site -- the sheet is where it
// comes from, and a caller passing the wrong half is not a thing a type can catch.
const firstName = (name: string) => name.split(" ")[0];

// Not drawn, and authored once for all three row actions rather than three times. Every console
// refusal raises SQLSTATE 42501 with a developer string nobody wrote for a member -- 'a console
// needs at least one owner', 'no access' for a member removed a moment ago, require_role's own for
// an Owner demoted in another tab. Through this console's own UI every one of them means the same
// thing, whichever action met it: the roster moved underneath this page. Saying it once is what
// keeps three copies from drifting into three slightly different claims about the same fact.
const rosterMoved = "The team has changed since this page loaded. Reload it and try again.";

// The sheet gives dlg_owner one primary button reading "OK" (ConsoleTeam.dc.html:344). Every other
// notice drawn in that shape gets the same word, because it is the same button doing the same
// nothing -- acknowledging a refusal there is nothing to confirm.
const noticeOk = "OK";

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
  // ConsoleTeamPhone.dc.html:85, the phone sheet's one line in place of every management control
  // the desktop sheet draws -- no Invite trigger, no row menu (:254 forces it off), no Resend or
  // Revoke. Drawn, not authored: its siblings use the same device (AuditLogPhone's "… to export.",
  // ConsoleSwitchesPhone's "… to edit"), so it is a house pattern rather than one page's idea.
  manageOnLargerScreen: "Open on a larger screen to manage the team.",

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
      // ConsoleTeam.dc.html:163's own fifth header, inside a visually-hidden span exactly as the
      // Members table's is (:112). Task 3 left the column out because it had nothing to put in it
      // -- Resend and Revoke are Task 7's (task-3-report.md) -- and this is where they arrive.
      actions: "Actions",
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
    // "Try again", with no reload: unlike the two below, nothing this dialog digests comes from the
    // roster it rendered. The tap is minted over the member's id and the role just chosen in the
    // picker, so a retry from the page as it stands can genuinely succeed.
    tapMismatch: "That confirmation no longer matches this change. Try again.",
    // Not drawn. Every console refusal raises SQLSTATE 42501 and a developer string nobody wrote
    // for a member: 'a console needs at least one owner' (decided in the browser before any request
    // goes out, task-5-addendum.md §3), 'no access' for a member removed a moment ago, and
    // require_role's own for an Owner who was demoted in another tab. One sentence for all of them,
    // authored above so the three row actions cannot drift apart.
    refused: rosterMoved,
  },

  // dlg_reset (ConsoleTeam.dc.html:288-300, task-6) -- TC-01 itself, like dlg_role, with a bold
  // line and a hint and no Change row at all (task-6-addendum.md §1). The menu item that opens it
  // is `changeRole.resetKeys` above, where the sheet draws the whole three-item menu at once.
  resetKeys: {
    // :291's own bold line -- TC-01's `summary`. The member's FULL name.
    title: (name: string) => `Reset ${name}'s keys`,
    // :293, word for word, and the member's FIRST name only -- the same split dlg_role draws. "two
    // new keys" is the sheet's own wording for spec §B's two-key floor at sign-in, not a count read
    // from this member's row.
    hint: (name: string) => `${firstName(name)} is signed out everywhere and will add two new keys at next sign-in.`,

    // Not drawn. console_reset_keys returns how many keys it deleted -- task-6-brief.md's "a reset
    // reports how many keys went" -- and this is the sentence built from it, in the shape
    // ConsoleMyKeys' own "Key removed · logged" set. The count is the server's, recounted inside
    // its own transaction, never the number this page happened to be showing.
    resetToast: (n: number) => `${n} key${n === 1 ? "" : "s"} removed · logged`,
    // Not drawn, and deliberately longer than changeRole's. console.use_tap digests the key count
    // the browser rendered against the count the database recounts in the same transaction
    // (task-6-addendum.md §3), so this refusal means the member's keys moved in between. "Try
    // again" alone would be wrong advice: a retry from the same unrefreshed page would mint over
    // the same stale number and fail identically, which is why this asks for a reload.
    tapMismatch: "That confirmation no longer matches this member's keys. Their keys changed since this page loaded; reload it and try again.",
    refused: rosterMoved,

    // Not drawn, and its own words rather than dlg_owner's: this refusal is not about Owners or
    // about the console's floor, so "A console needs at least one Owner" / "Make someone else
    // Owner first." would answer a question nobody asked.
    //
    // `console_reset_keys` refuses a member acting on their own row outright
    // (20260922120000_console_reset_keys_blocks_self.sql, and see that file for the whole trace).
    // It deletes every key and never touches `status`, so a self-reset leaves the member signed out
    // with no key, unable to be re-invited -- console_invite_member refuses any address whose
    // member row is not 'removed' -- and, for a console's only Owner, with no supported way back at
    // all. The sheet's own hint on that row would meanwhile promise "two new keys at next sign-in",
    // a sign-in that cannot happen.
    //
    // The title states why rather than merely "you can't", and the detail names the route that
    // actually works: My keys adds a key and removes the old one under its own two-key floor, which
    // never passes through zero. That floor is the console's existing answer to "I want fresh
    // keys", and this is the first surface that had to point at it.
    ownKeys: {
      title: "Resetting your own keys would lock you out",
      detail: "Add a new key under My keys and remove the old one instead.",
      ok: noticeOk,
    },
  },

  // dlg_remove (ConsoleTeam.dc.html:313-325, task-6) -- TC-01 again, and the sheet's own dlg_owner
  // in front of it when the floor would refuse (see `lastOwner` below). The menu item that opens it
  // is `changeRole.remove` above.
  removeMember: {
    // :316's own bold line. The member's FULL name, and "from the console" is part of the line.
    title: (name: string) => `Remove ${name} from the console`,
    // :318, word for word. FIRST name only. Shorter than dlg_role's on purpose: a removed member
    // does not sign in again, so there is no second half about what they come back as.
    hint: (name: string) => `${firstName(name)} is signed out everywhere at once.`,

    // Not drawn, in the same shape as the two toasts above.
    removedToast: "Member removed · logged",
    // Not drawn. `console.use_tap('Removed a member', p_member::text, v_target.role::text, …)`
    // digests the target's role as the database reads it under a lock, against the role this page
    // rendered -- so this refusal means their role moved in between, and a retry from the same
    // unrefreshed page would fail the same way. Same reasoning as resetKeys.tapMismatch above.
    tapMismatch: "That confirmation no longer matches this member. Their role changed since this page loaded; reload it and try again.",
    refused: rosterMoved,
  },

  // dlg_resend (ConsoleTeam.dc.html:347-357, task-7) -- a plain alertdialog, not TC-01, and the
  // only row action on this page that opens one. Resending re-sends a letter to an address an Owner
  // already approved and changes no access, so it takes no tap (task-7-brief.md's own ruling, the
  // same rename-versus-remove reasoning 2d-1 used) -- and `console_resend_invite` accordingly has no
  // p_reason to spend one with. The row button that opens it is `trigger` below.
  resendInvite: {
    // :163's own button label, and :355's own primary inside the dialog -- the sheet gives both the
    // identical word, so both read it from here, the same way `invite.trigger` serves two triggers
    // and an h2. Cancel is ConfirmDialog's own default (messages.common.cancel, "Cancel"), which is
    // what :354 draws.
    trigger: "Resend",
    // :351's own title.
    title: "Resend the invite?",
    // :352, word for word, with the address interpolated where the sheet mocks priya@example.com.
    // "7 days" is the sheet's own wording for the window `console_resend_invite` actually sets
    // (`expires_at = now() + interval '7 days'`), not a number read from the row.
    detail: (email: string) => `${email} gets a new link that lasts 7 days. The old link stops working.`,

    // Not drawn: ConsoleTeam.dc.html passes no `toast` to frame() at any call site, and a mutation
    // that succeeds with no visible confirmation is a defect. Same shape as the three above it.
    resentToast: "Invite resent · logged",
    // Not drawn, and there is no tapMismatch beside it: this action spends no tap, so the only
    // refusal it can meet is 'no access' for an invite accepted, revoked or resent away in another
    // tab, plus require_role's own for an Owner demoted in one. Both mean this page is out of date,
    // which is what the shared line above already says.
    refused: rosterMoved,
  },

  // dlg_revoke (ConsoleTeam.dc.html:360-370, task-7). The sheet draws it as a plain alertdialog
  // like dlg_resend above -- no reason field, no "Tap your key" -- but `console_revoke_invite` calls
  // `console.use_tap('Revoked an invite', p_invite::text, v_invite.email, p_reason)` and *requires*
  // both. The database is shipped and is the security boundary, and the plan's own ruling is that
  // revoking withdraws access that was granted and so takes a tap; the sheet is the document that is
  // behind (task-7-addendum.md §3). So both of its drawn lines are carried into TC-01 -- the title
  // as `summary`, the detail as `hint` -- and TC-01 adds only the reason and the tap. No Change row:
  // there is no before-and-after pair here, the same shape dlg_reset and dlg_remove take.
  revokeInvite: {
    // :163's own button label, which is also :368's own primary inside the dialog -- but the dialog
    // is TC-01 now, whose primary is "Tap your key", so here this names the row button alone.
    trigger: "Revoke",
    // :364's own title -- TC-01's `summary`. The address is not in it, exactly as the sheet writes
    // it: the line beneath names the address, so the bold line does not repeat it.
    title: "Revoke the invite?",
    // :366, word for word -- TC-01's `hint`, the optional slot Task 5 added for precisely this.
    hint: (email: string) => `The link sent to ${email} stops working at once.`,

    // Not drawn, in the same shape as the toasts above.
    revokedToast: "Invite revoked · logged",
    // Not drawn. console.use_tap's own 'no tap for this action'. "Try again", with no reload --
    // unlike resetKeys' and removeMember's, and for the reason changeRole.tapMismatch gives: nothing
    // this tap digests comes from data that could have moved underneath the page. The invite's id
    // and its address are both fixed for the life of the invite, and a resend changes neither, so a
    // retry from the page as it stands can genuinely succeed.
    tapMismatch: "That confirmation no longer matches this invite. Try again.",
    refused: rosterMoved,
  },

  // dlg_owner (:334-346), a `role="alertdialog"` with a single primary button. Word for word. It is
  // drawn from the roster the page already holds, never from the database's refusal: that message
  // is a developer string, and it arrives with the same 42501 as every other refusal, so there is
  // nothing in it to tell the two apart by (task-5-addendum.md §3). Shown for a role change and for
  // a removal alike -- console_remove_member carries console_change_role's two refusals word for
  // word (task-6-addendum.md §4) -- so one set of words serves both, as the sheet draws it.
  lastOwner: {
    title: "A console needs at least one Owner",
    detail: "Make someone else Owner first.",
    ok: noticeOk,
  },
} as const satisfies MessageTree;
