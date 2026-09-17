import type { MessageTree } from "../types";

export const home = {
  hero: {
    title: "Check your PNR. Read what the railway returned.",
    lead: "Ten digits from your ticket, one request to the source, every field labelled with where it came from and when.",
    assurances: {
      free: "Free",
      noAccount: "No account needed",
      notLogged: "PNR never logged",
    },
  },
  how: {
    title: "Three steps, nothing hidden",
    steps: [
      { title: "Enter the PNR", detail: "The 10-digit number printed top-left on your ticket, or in your booking SMS." },
      { title: "Run the request", detail: "One live request to the railway source at the moment you press Run. Nothing pre-computed, nothing filled in." },
      { title: "Read what came back", detail: "Status, coach and berth, train and journey. Every field carries its source and the time it was retrieved." },
    ],
  },
  claims: {
    title: "What you can count on",
    rows: [
      {
        legend: "Source",
        title: "Only fields the source returned.",
        detail: "If the railway source did not send a field, you see “not returned”, never a guess. No confirmation odds are invented. Every result names its source and retrieval time.",
      },
      {
        legend: "Account",
        title: "Free, and no account to check.",
        detail: "A check needs only the number. Sign in only if you want a watchlist that follows you between devices. It stays optional.",
      },
      {
        legend: "Privacy",
        title: "PNRs and passenger names are never logged.",
        detail: "Your PNR is used to make the request and is not written to our logs. Recent checks stay on your device, and you can clear them any time.",
      },
    ],
  },
  availability: {
    title: "What is connected right now",
    lead: "The live state of every data source behind this product. When one is not connected, the product says so instead of guessing.",
    link: "Read the data policy",
  },
  cta: {
    title: "Got a ticket? Run a check.",
    lead: "No sign-up. Only what the railway returned.",
  },
} as const satisfies MessageTree;
