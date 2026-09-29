import type { MessageTree } from "../types";

// The landing journey's instruments, verbatim from prototype v3 (approved 2026-09-24).

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six"] as const;

export const journey = {
  stations: {
    top: "Platform 3 · Departures",
    anatomy: "The train, drawn",
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
    readout: (time: string, when: string) => `Chart ${time} IST · ${when}`,
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
  chapters: {
    pnrGroups: "PNR number · 3–3–4",
    noDigits: "— — —",
    steps: [{ label: "Validate" }, { label: "Source" }, { label: "Result" }],
    trace: "Request trace",
    step: (n: number, of: number) => `${String(n).padStart(2, "0")} / ${String(of).padStart(2, "0")}`,
    cards: {
      pnr: "PNR",
      digits: "digits",
      tenOfTen: "10 / 10",
      groups: "groups",
      groupsValue: "3 · 3 · 4",
      validate: "validate",
      ok: "ok",
      source: "source",
      askedOnce: "asked once",
      result: "result",
      asReturned: "as returned",
      status: "status",
      party: "party",
      retrieved: "retrieved",
    },
    party: (n: number, status: string, seat: string | null) => (seat ? `P${n} · ${status} · ${seat}` : `P${n} · ${status}`),
    partyOf: (count: number) => `${NUMBER_WORDS[count] ?? String(count)} ${count === 1 ? "passenger" : "passengers"}`,
    time: (time: string) => `${time} IST`,
    stamp: (time: string) => `Retrieved ${time} IST · Sample data`,
  },
  run: {
    /** A kilometre post along the run's line (v3: "KM 530"). */
    km: (figure: string) => `KM ${figure}`,
  },
} as const satisfies MessageTree;
