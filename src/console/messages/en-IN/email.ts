// Console email, plain text in today's sign-in style (spec §I). No PNR, no traveller address,
// ever. The link is the only thing in it that is not fixed text.
//
// **Not drawn.** Every line of both letters is authored: no sheet in docs/design/sheets/console
// holds any email copy at all, and none ever has. The flag sits once here rather than on each
// string, because there is nothing in this file it does not apply to -- unlike en-IN/team.ts,
// where transcribed and authored lines stand side by side and each authored one has to say so.
// The subjects are the contract the e2e suite reads letters by
// (tests/e2e/console-auth/team-helpers.ts), so changing one is a change to a test, not only to
// copy.
//
// Not `satisfies MessageTree`: `signIn` and `invite` return `{ subject, text }`, and `Leaf`
// (src/messages/types.ts) only admits a string or a function returning one. This is the one
// message module that can't be typed by it.
export const email = {
  signIn: ({ name, link }: { readonly name: string; readonly link: string }) => ({
    subject: "Your Trakline console sign-in link",
    text: [
      `Hello ${name},`,
      "",
      "Open this link to sign in to the Trakline console. It works once and expires in 1 hour.",
      "",
      link,
      "",
      "You will still need your security key.",
      "",
      "If you did not ask for this, you can ignore it — nobody can sign in without your key.",
      "",
      "— Trakline Console",
    ].join("\n"),
  }),
  // `role` is already resolved to its display word (consoleMessages.frame.roleLabel), not the
  // database's lowercase enum -- the caller (src/console/email/invite.ts) does that lookup so this
  // stays plain copy, the same division sendSignInLink draws around `name`. `link` is the only
  // place the raw invite token appears anywhere in the letter.
  invite: ({ role, invitedBy, link }: { readonly role: string; readonly invitedBy: string; readonly link: string }) => ({
    subject: "You're invited to the Trakline console",
    text: [
      `${invitedBy} invited you to the Trakline console as ${role}.`,
      "",
      "Open this link to accept and set up your account. It works once and expires in 7 days.",
      "",
      link,
      "",
      "If you did not expect this, you can ignore it.",
      "",
      "— Trakline Console",
    ].join("\n"),
  }),
} as const;
