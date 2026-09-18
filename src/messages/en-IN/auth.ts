import type { MessageTree } from "../types";

// Copy transcribed from the Sign in B sheet.

export const auth = {
  title: "Sign in",
  lead: "Keeps your watchlist across devices. No password: a link to your inbox, or Google.",
  /** The lead while Google sign-in is switched off: never promise a route that is not there. */
  leadEmailOnly: "Keeps your watchlist across devices. No password: a link to your inbox.",
  /** The lead when this device can use a passkey too. */
  leadPasskey: "Keeps your watchlist across devices. No password: your device's passkey, or a link to your inbox.",
  email: "Email",
  emailPlaceholder: "you@example.com",
  sendLink: "Email me a sign-in link",
  sending: "Sending…",
  google: "Continue with Google",
  passkey: "Continue with a passkey",
  passkeyWaiting: "Waiting for your device…",
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
    passkey: "That passkey did not work. Try again, or ask for an email link.",
  },
  notConfigured: {
    title: "Sign-in is not connected",
    detail: "This deployment has no account service configured. Checking a PNR still works without an account.",
  },
} as const satisfies MessageTree;
