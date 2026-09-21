// Console email, plain text in today's sign-in style (spec §I). No PNR, no traveller address,
// ever. The link is the only thing in it that is not fixed text.
//
// Not `satisfies MessageTree`: `signIn` returns `{ subject, text }`, and `Leaf` (src/messages/types.ts)
// only admits a string or a function returning one. This is the one message module that can't be typed
// by it.
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
} as const;
