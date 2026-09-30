import type { MessageTree } from "../types";

/** Sign-ups (spec 2026-09-28-subscriptions-core §3–4). Error copy verbatim from the B4 brief, with Resend's 05:30 IST reset. */
export const subscribe = {
  sent: "Check your inbox to confirm.",
  errors: {
    invalid: "Enter an email address like name@example.com.",
    limited: "Too many sign-ups from this connection. Try again later.",
    // 05:30 IST, not midnight: Resend's day is UTC's, and the copy follows Resend rather than India.
    dailyLimit: "We can't send more confirmation emails today. Try again after 05:30 IST.",
    failed: "That didn't go through. Try again.",
  },
  promise: {
    news: "About once a month: new features and service changes.",
    availability: "One email when availability checks open.",
  },
  email: {
    subject: "Confirm your Trakline updates",
    body: (promise: string, link: string) =>
      `You asked for Trakline updates by email.\n\n${promise}\n\nConfirm here:\n${link}\n\nThe link works for 48 hours. If you didn't ask for this, ignore it — we delete the address in 7 days.\n`,
  },
} as const satisfies MessageTree;
