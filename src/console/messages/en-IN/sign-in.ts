import type { MessageTree } from "@/messages/types";

// Console Sign In (Form TC-02), word for word from docs/design/sheets/console/ConsoleSignIn.dc.html.
export const signIn = {
  pageTitle: "Sign in",
  title: "Console sign in",
  lead: "For the Trakline team. Use your console email, not your everyday account.",
  form: "Form TC-02",
  plate: "Email link",
  emailLabel: "Console email",
  emailPlaceholder: "name@example.com",
  send: "Email me a sign-in link",
  sending: "Sending…",
  legend: "The link works once and expires in 1 hour.",
  invalid: "Enter an email address like name@example.com.",
  tooMany: "Too many sign-in requests. Try again in 10 minutes.",
  sent: {
    title: "Check your inbox",
    detail: "If this address belongs to a console member, a sign-in link is on its way.",
    again: "Send it again",
    againIn: (seconds: number) => `Send again in ${seconds} s`,
    different: "Use a different email",
  },
} as const satisfies MessageTree;
