import type { MessageTree } from "../types";

// Copy for Form TL-02, transcribed from the Claude Design sheet "Pre-booking Availability".
//
// The form starts at the stations because nothing can turn a train number into a route: the source
// has no train-to-route lookup, and the availability endpoint needs a station pair. So From and To
// come first, and the train is chosen from what that route answers.
//
// Two sentences carry the most weight, and neither may ever be softened into the other:
// `route.none` means "that pair has no trains" — a fact about the railway. Everything in
// `messages.source` means "we could not ask". A traveller acts differently on each.

export const booking = {
  title: "Availability before booking",
  lead: "Pick the stations, the train and the date. Trakline answers from the live reservation chart.",
  form: { title: "Availability request", sheet: "Form TL-02" },
  from: "From",
  to: "To",
  stationPlaceholder: "Code",
  train: {
    label: "Train",
    waiting: "Enter From and To",
    none: "No trains to choose",
    looking: "Looking for trains…",
  },
  route: {
    found: (count: number, from: string, to: string) => `${count === 1 ? "1 train runs" : `${count} trains run`} ${from} → ${to}.`,
    none: (from: string, to: string) => `No trains run ${from} → ${to}. Check both codes — they are station codes, not names.`,
    /** Shown beside a chosen train, from the route answer's own fields. Never assembled from a guess. */
    detail: (departs: string, travelTime: string) => `Departs ${departs}, takes ${travelTime}.`,
  },
  cls: "Class",
  quota: "Quota",
  date: "Journey date",
  submit: "Check availability",
  checking: "Reading the chart…",
  classes: {
    "1A": "1A · First AC",
    "2A": "2A · AC 2-tier",
    "3A": "3A · AC 3-tier",
    SL: "SL · Sleeper",
    CC: "CC · AC chair car",
    EC: "EC · Executive chair",
    "2S": "2S · Second sitting",
  },
  quotas: {
    GN: "GN · General",
    PQWL: "PQWL · Pooled",
    RLWL: "RLWL · Remote location",
    TQWL: "TQWL · Tatkal waitlist",
    LD: "LD · Ladies",
    TQ: "TQ · Tatkal",
  },
  pastDate: "Pick today or a later date.",
  availability: {
    title: "Availability",
    retrieved: (time: string) => `Retrieved ${time} IST from Trakline.`,
    window: "Four dates come back at a time.",
    columns: { date: "Date", availability: "Availability", fare: "Fare" },
    /** The queue's two ends: where it started when booking opened, and where it is now. */
    waitlistOf: (opened: number) => `of ${opened} when booking opened`,
    nobodyCleared: "nobody has cleared yet",
    closed: "Booking closed",
    /**
     * Says only what the source said: `canBook` is false. It used to say "The chart is prepared.
     * This is how it finished." — which production disproved on 2026-09-25, answering canBook false
     * for a date twenty-one days out, where no chart exists yet. The reason is not measured, so no
     * reason is given.
     */
    closedNote: "Booking is closed for this date.",
    today: "Today",
    fare: (total: number) => `₹${total.toLocaleString("en-IN")}`,
  },
  result: {
    title: "No availability returned",
    requested: (train: string, cls: string, quota: string, date: string) => `Requested: ${train} · ${cls} · ${quota} · ${date}.`,
    responseLabel: "Response",
    responseValue: "Unavailable",
    provenanceLabel: "Provenance",
    provenanceValue: "Trakline",
    fallbackLabel: "Fallback",
    fallbackValue: "None",
  },
  lifecycle: "Availability request lifecycle",
  steps: { input: "Request entered", train: "Train resolved", chart: "Reservation chart read", result: "Result" },
  stepStates: {
    waitingRoute: "Waiting for a route",
    waitingTrain: "Waiting for a train",
    waitingDate: "Waiting for a date",
    waitingRequest: "Waiting for a request",
    lookingUp: "Looking for trains",
    noTrains: (from: string, to: string) => `No trains run ${from} → ${to}`,
    chosen: (name: string, from: string, to: string) => `${name}, ${from} → ${to}`,
    asked: (train: string, cls: string, quota: string, date: string) => `${train} · ${cls} · ${quota} · ${date}`,
    reading: "Reading the chart",
    returned: (count: number, time: string) => `${count} dates returned at ${time} IST`,
    refused: (time: string) => `Refused at ${time} IST`,
    notReached: "Not reached — nothing was asked",
    shownAbove: "Shown above",
    none: "None",
    tryAgain: "None — try again shortly",
  },
} as const satisfies MessageTree;
