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
    /** Appended by the sender to every list email, never typed by the operator; the link follows on the next line. */
    unsubscribeLine: "You are getting this because you asked for news about Trakline. Stop at any time:",
  },
  form: {
    label: "Email",
    placeholder: "you@example.com",
    subscribe: "Subscribe",
    notify: "Notify me",
    sending: "Sending…",
    /** Split so the last two words can be a link without a component assembling a sentence. */
    consent: { text: "One email to confirm. Unsubscribe in one click. We never sell your address. ", link: "Privacy notice" },
  },
  places: {
    footerColumn: "Updates by email",
    /** The plate's own heading under the pre-booking result — NOT `booking.availability.title`, which is the chart's "Availability". */
    preBookingTitle: "Availability checks",
    preBooking: "Tell me once when availability checks open. One email, nothing else.",
  },
  page: {
    closing: "Checking a PNR never needs an account, and never needs an email address.",
    confirm: {
      headline: "Confirm your subscription",
      lead: "Opening this link changed nothing. Press Confirm and the list is yours.",
      button: "Confirm",
      after: "You're subscribed. Every email has a one-click unsubscribe.",
      already: "You're already subscribed.",
      expired: "This link has expired.",
      sendAgain: "Send a new link",
      sendAgainNote: "A new link goes through the same checks as the first one.",
    },
    unsubscribe: {
      headline: "Unsubscribe",
      lead: "Opening this link changed nothing. Press Unsubscribe and it stops.",
      button: "Unsubscribe",
      after: "You're unsubscribed. Sign-in emails and the alerts you set up aren't affected.",
      already: "You're already unsubscribed.",
      changedMind: "Changed your mind?",
      resubscribe: "Resubscribe",
      whyLegend: "Tell us why (optional)",
      /** Label and value differ: the label reads as a sentence, the value is what the route's enum takes. */
      reasons: [
        { label: "Too many emails", value: "too many" },
        { label: "Not relevant", value: "not relevant" },
        { label: "I didn't sign up", value: "did not sign up" },
        { label: "Other", value: "other" },
      ],
    },
    invalid: {
      title: "That link isn't valid.",
      note: "Links break when an email client rewrites them. Open the one in your inbox again, or ask for a new one from the form you signed up on.",
    },
    /** The board draws the unsubscribe promises in the second person, because the reader is leaving. */
    leaving: { news: "You are unsubscribing from news about Trakline.", availability: "You are unsubscribing from the availability list." },
  },
} as const satisfies MessageTree;
