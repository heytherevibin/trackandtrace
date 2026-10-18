import type { MessageTree } from "../types";

// The landing sheet, verbatim from Landing Redesign B.

export const home = {
  hero: {
    lineOne: "Your PNR,",
    lineTwo: "as the railway records it.",
    kicker: "Indian Railways PNR · read live from the source",
    lead: "Ten digits from your ticket, one live request to the source. Every field is shown exactly as returned, with where it came from and when. Never a guess, never an invented confirmation chance.",
    tags: {
      free: "Free",
      noAccount: "No account",
      notLogged: "PNR never logged",
      failsClosed: "Fails closed",
    },
  },
  // The live terminus's nameboard (scene/live.ts reads it for the engine's board face).
  drawing: {
    nameboard: { platform: "PLATFORM 3", departures: "DEPARTURES" },
  },
  principles: {
    title: "Trakline — operating principles",
    code: "TT-100",
    sheet: "Sheet 01 of 04",
    label: "Operating principles",
    rows: [
      { num: "01", prop: "Fields shown beyond the source response", val: "0", rem: "If the source did not send a field, the record says “not returned”, never a guess." },
      { num: "02", prop: "Confirmation odds invented", val: "0", rem: "Estimates shown are the reservation service’s, never ours. Trakline calculates none." },
      { num: "03", prop: "Account required to check", val: "None", rem: "Sign in only for a watchlist that follows you between devices. It stays optional." },
      { num: "04", prop: "PNRs and names written to logs", val: "0", rem: "Recent checks stay on your device, and you can clear them any time." },
    ],
    note: "Strict real-only policy: if the source is silent, the product says so and stops. Nothing on this sheet is a marketing estimate.",
  },
  how: {
    kicker: "02 · How it works",
    title: "Three stops, nothing hidden",
    stepLabel: (num: string, kicker: string) => `${num} · ${kicker}`,
    steps: [
      { num: "01", kicker: "Origin", title: "Enter the PNR", detail: "The 10-digit number printed top-left on your ticket, or in your booking SMS, punched in 3–3–4 as it appears there." },
      { num: "02", kicker: "En route", title: "Run the request", detail: "One live request to the railway source at the moment you press Run. Nothing pre-computed, nothing filled in." },
      { num: "03", kicker: "Terminus", title: "Read what came back", detail: "Status, coach and berth, train and journey. Every field carries its source and the time it was retrieved." },
    ],
  },
  reliability: {
    kicker: "04 · Reliability",
    title: "Real records, checked live",
    lead: "Trakline asks for your reservation at the moment you check and shows exactly what comes back.",
    facts: [
      { legend: "Live at check", title: "Asked the moment you press Run", detail: "Each check asks for the current record. A repeat within a minute is marked as the last minute's read." },
      { legend: "Time-stamped", title: "Every result shows when it was retrieved", detail: "The retrieval time sits beside the status, in IST, so an old answer never passes for a new one." },
      { legend: "Never estimated", title: "A missing field reads “Not returned”", detail: "Nothing is predicted, filled in or rounded up. Where the reservation service publishes its own estimate it is shown as theirs, labelled." },
    ],
    policy: "Read the data policy",
  },
  roadmap: {
    kicker: "05 · On the roadmap",
    title: "Extensions under construction",
    lead: "Each ships only when a verified source stands behind it, the same rule the check follows.",
    /** Each row says which it is. A single hard-coded "Planned" outlived the work it described. */
    status: { planned: "Planned", live: "Live" },
    items: [
      { num: "01", title: "Live train running status", note: "Where the train is right now, from a verified running-status feed.", status: "planned" },
      { num: "02", title: "Coach position", note: "Where your coach halts on the platform, so you stand at the right spot.", status: "planned" },
      /** Live: `/api/route-availability` answers a pre-booking search through the same provider seam the check uses. */
      { num: "03", title: "Seat availability", note: "Open berths by class and date, straight from inventory.", status: "live" },
      { num: "04", title: "Platform locator", note: "The announced platform for your train at major stations.", status: "planned" },
      /** Live inside 03: the availability plate draws a fare per class and date. A fare table of its own is still to come. */
      { num: "05", title: "Fare enquiry", note: "The published fare table for a route and class. No markups, no bundling.", status: "live" },
      { num: "06", title: "Train schedule search", note: "Timetables by train number or station pair.", status: "planned" },
      { num: "07", title: "Chart preparation alerts", note: "A notification when the chart for a watched PNR is prepared.", status: "planned" },
    ],
  },
  faq: {
    kicker: "08 · Questions",
    title: "Asked before you ask",
    items: [
      { q: "Is this affiliated with IRCTC or Indian Railways?", a: "No. Trakline is an independent product. It requests your reservation record from a verified railway data source and shows exactly what came back." },
      { q: "Do I need an account?", a: "No. A check needs only the 10-digit PNR. An account adds one thing: a watchlist that syncs between your devices. It stays optional." },
      { q: "Is my PNR stored or logged?", a: "PNRs and passenger names are never written to our logs. Your PNR is used to make the request; recent checks stay on your device and you can clear them any time." },
      { q: "Why does a field say “not returned”?", a: "Because the source did not send it. The product never fills a gap with a guess. It fails closed: no source, no claim." },
      { q: "Does it predict my confirmation chances?", a: "No, and it never will here. Invented odds are the one thing this product exists to not show you. You get the record, its source, and its retrieval time." },
      { q: "Where does the data come from?", a: "From a third-party railway data service. Trakline asks it for your reservation when you run a check and shows only the fields it returned, with the time of retrieval. If the service does not answer, Trakline says so and shows nothing in its place." },
      // Chart timing per the Railway Board rule of December 2025; update this answer when the rule changes.
      { q: "When should I check?", a: "The first reservation chart decides waitlisted and RAC tickets. It is prepared at least 10 hours before departure, or at 20:00 the night before for trains leaving between 05:00 and 14:00. Save the PNR to your watchlist and re-check as the chart approaches, in Indian Standard Time, everywhere." },
    ],
  },
  closing: {
    title: "Got a ticket? Run a check",
    meta: "No sign-up",
    headline: "Only what the railway returned.",
    action: "Run a check",
  },
  terminus: {
    caption: "Terminus · the check starts here",
  },
} as const satisfies MessageTree;
