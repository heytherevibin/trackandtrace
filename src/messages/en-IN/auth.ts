import type { MessageTree } from "../types";

export const auth = {
  title: "Sign in",
  lead: "Keeps your watchlist across devices. No password: a link to your inbox, or Google.",
  email: "Email",
  emailPlaceholder: "you@example.com",
  sendLink: "Email me a sign-in link",
  sending: "Sending",
  google: "Continue with Google",
  without: "Continue without an account",
  footnote: "Checking a PNR never needs an account.",
  sent: {
    title: "Check your inbox",
    detail: (email: string) => `We sent a sign-in link to ${email}. It expires in an hour.`,
    resend: "Send it again",
    change: "Use a different email",
  },
  errors: {
    link: "That sign-in link did not work. Request a new one.",
    invalidEmail: "Enter a valid email address.",
  },
  notConfigured: {
    title: "Sign-in is not connected",
    detail: "This deployment has no account service configured. Checking a PNR still works without an account.",
  },
} as const satisfies MessageTree;
