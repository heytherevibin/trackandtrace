import type { MessageTree } from "../types";

// The landing journey's instruments, verbatim from prototype v3 (approved 2026-09-24).

export const journey = {
  stations: {
    top: "Platform 3 · Departures",
    principles: "Operating principles",
    how: "How it works",
    record: "The record you get",
    reliability: "Reliability",
    roadmap: "On the roadmap",
    features: "More than a check",
    use: "Where it gets used",
    faq: "Questions",
    terminus: "Run a check",
  },
  strip: {
    label: "Route through this page",
    stop: (code: string, name: string) => `${code} · ${name}`,
    km: (figure: string) => `KM ${figure}`,
  },
  board: {
    title: "Departures · Platform 3",
    scope: "This page",
    caption: "The sections of this page, listed as departures",
    stn: "Stn",
    destination: "Destination",
    km: "Km",
    status: "Status",
    statuses: { departed: "Departed", here: "At platform", next: "Next" },
  },
  dial: {
    groups: [{ label: "1–3" }, { label: "4–6" }, { label: "7–10" }],
  },
  berths: {
    title: (coach: string, cls: string) => `Coach ${coach} · ${cls} · plan`,
    sample: "Sample data",
    litLead: (status: string) => `Passenger 1 · ${status} · berth `,
    seat: (coach: string, berth: string) => `${coach} · ${berth}`,
    litOnly: ", lit.",
    waiting: (who: string, statuses: string) => `, lit. Passengers ${who} (${statuses}) have no berth allotted yet.`,
  },
  clock: {
    label: "Station clock, Indian Standard Time",
    at: (time: string) => `Station clock: ${time} IST`,
    brand: "TRAKLINE",
    ist: "IST",
  },
} as const satisfies MessageTree;
