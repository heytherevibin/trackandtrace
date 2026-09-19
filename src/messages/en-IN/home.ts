import type { MessageTree } from "../types";

// The landing sheet, verbatim from Landing Redesign B.

export const home = {
  hero: {
    lineOne: "Your PNR,",
    lineTwo: "as the railway records it.",
    lead: "Ten digits from your ticket, one live request to the source. Every field is shown exactly as returned, labelled with where it came from and when — never a guess, never an invented confirmation chance.",
    tags: {
      free: "Free",
      noAccount: "No account needed",
      notLogged: "PNR never logged",
      failsClosed: "Fails closed",
    },
  },
  principles: {
    title: "Trakline — operating principles",
    code: "TT-100",
    sheet: "Sheet 01 of 04",
    label: "Operating principles",
    rows: [
      { num: "01", prop: "Fields shown beyond the source response", val: "0", rem: "If the source did not send a field, the record says “not returned” — never a guess." },
      { num: "02", prop: "Confirmation odds invented", val: "0", rem: "Prediction fields exist in the type layer and are never rendered." },
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
  record: {
    kicker: "03 · The record you get",
    title: "Every field, with its source on it",
    bodyOne:
      "A result is the reservation record as the source holds it: current status per passenger, coach and berth where allotted, the train and journey, and the retrieval time. Where the source did not send a field, the record says “not returned”. The specimen here is generated from the labelled development fixture — it is design material, not a real reservation.",
    bodyTwo: "One booking often holds several passengers in different states — this specimen shows a party of three: one confirmed, one RAC, one still waitlisted.",
    plateTitle: "Specimen record",
    plateSheet: "Sheet 02",
    leadTag: (label: string) => `${label} — lead passenger`,
    trainLine: (number: string, name: string, route: string) => `${number} · ${name} · ${route}`,
    journeyLine: (date: string, departs: string, quota: string) => `${date} · departs ${departs} IST · quota ${quota}`,
    caption: "Specimen passengers",
  },
  reliability: {
    kicker: "04 · Reliability",
    title: "Real records, checked live",
    lead: "Trakline asks for your reservation at the moment you check and shows exactly what comes back.",
    facts: [
      { legend: "Live at check", title: "Asked the moment you press Run", detail: "Each check asks for the current record. A repeat within a minute is marked as the last minute's read." },
      { legend: "Time-stamped", title: "Every result shows when it was retrieved", detail: "The retrieval time sits beside the status, in IST, so an old answer never passes for a new one." },
      { legend: "Never estimated", title: "A missing field reads “Not returned”", detail: "Nothing is predicted, filled in or rounded up. Confirmation odds are never shown." },
    ],
    policy: "Read the data policy",
  },
  roadmap: {
    kicker: "05 · On the roadmap",
    title: "Extensions under construction",
    lead: "Each ships only when a verified source stands behind it — the same rule the check follows.",
    planned: "Planned",
    items: [
      { num: "01", title: "Live train running status", note: "Where the train is right now, from a verified running-status feed." },
      { num: "02", title: "Coach position", note: "Where your coach halts on the platform, so you stand at the right spot." },
      { num: "03", title: "Seat availability", note: "Open berths by class and date, straight from inventory." },
      { num: "04", title: "Platform locator", note: "The announced platform for your train at major stations." },
      { num: "05", title: "Fare enquiry", note: "The published fare table for a route and class — no markups, no bundling." },
      { num: "06", title: "Train schedule search", note: "Timetables by train number or station pair." },
      { num: "07", title: "Chart preparation alerts", note: "A notification when the chart for a watched PNR is prepared." },
    ],
  },
  features: {
    kicker: "06 · More than a check",
    open: (title: string) => `Open ${title} →`,
    watchlist: {
      title: "Watchlist",
      detail: "Save a PNR and re-check it in one tap. It lives on your device; sign in only if you want it to follow you between devices — with merge and undo when it syncs.",
    },
    preBooking: {
      title: "Pre-booking",
      detail: "Plan a journey before you book. The form is ready today; it fills with live availability the day a timetable and inventory source is connected.",
    },
    accuracy: {
      title: "Accuracy",
      detail: "A public ledger of how results matched outcomes. It opens with zero records and earns every entry — nothing on it will ever be invented.",
    },
  },
  photo: {
    kicker: "07 · Where it gets used",
    title: "Legible under stress",
    bodyOne: "A crowded platform in harsh daylight, or a moving berth at night — one hand free, low attention. The interface is built to be read in one glance, with day and night faces that follow your device.",
    bodyTwo: "Installable as an app, so the check stays one tap away for the days you keep re-checking the same ticket before the chart.",
    platformNumber: "3",
  },
  faq: {
    kicker: "08 · Questions",
    title: "Asked before you ask",
    items: [
      { q: "Is this affiliated with IRCTC or Indian Railways?", a: "No. Trakline is an independent product. It requests your reservation record from a verified railway data source and shows exactly what came back." },
      { q: "Do I need an account?", a: "No. A check needs only the 10-digit PNR. An account adds one thing: a watchlist that syncs between your devices. It stays optional." },
      { q: "Is my PNR stored or logged?", a: "PNRs and passenger names are never written to our logs. Your PNR is used to make the request; recent checks stay on your device and you can clear them any time." },
      { q: "Why does a field say “not returned”?", a: "Because the source did not send it. The product never fills a gap with a guess — it fails closed: no source, no claim." },
      { q: "Does it predict my confirmation chances?", a: "No, and it never will here. Invented odds are the one thing this product exists to not show you. You get the record, its source, and its retrieval time." },
      { q: "Where does the data come from?", a: "From a third-party railway data service. Trakline asks it for your reservation when you run a check and shows only the fields it returned, with the time of retrieval. If the service does not answer, Trakline says so and shows nothing in its place." },
      // Chart timing per the Railway Board rule of December 2025; update this answer when the rule changes.
      { q: "When should I check?", a: "The first reservation chart decides waitlisted and RAC tickets. It is prepared at least 10 hours before departure, or at 20:00 the night before for trains leaving between 05:00 and 14:00. Save the PNR to your watchlist and re-check as the chart approaches — in Indian Standard Time, everywhere." },
    ],
  },
  closing: {
    title: "Got a ticket? Run a check",
    meta: "No sign-up",
    lead: "Only what the railway returned — nothing filled in, nothing predicted.",
  },
} as const satisfies MessageTree;
