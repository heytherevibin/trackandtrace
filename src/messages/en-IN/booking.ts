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
  lead: "Pick the stations, the date and the classes you would travel in. Every train on that route answers at once.",
  form: { title: "Availability request", sheet: "Form TL-02" },
  from: "From",
  to: "To",
  stationPlaceholder: "Code",
  route: {
    found: (count: number, from: string, to: string) => `${count === 1 ? "1 train runs" : `${count} trains run`} ${from} → ${to}.`,
    none: (from: string, to: string) => `No trains run ${from} → ${to}. Check both codes — they are station codes, not names.`,
  },
  cls: "Class",
  quota: "Quota",
  date: "Journey date",
  submit: "Find trains",
  checking: "Asking the route…",
  /** The class on its own, for a chip that shows only the code and must still be readable aloud. */
  classNames: {
    "1A": "First AC",
    "2A": "AC 2-tier",
    "3A": "AC 3-tier",
    SL: "Sleeper",
    CC: "AC chair car",
    EC: "Executive chair",
    "2S": "Second sitting",
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
  /**
   * The route list. Two phrases carry weight and must never be swapped: a class NOT ASKED is a
   * choice the reader has not spent a request on; a train that FAILED was asked and could not be
   * answered. Neither may borrow the other's sentence.
   */
  list: {
    title: "Trains on this route",
    count: (trains: number, cls: string) => `${trains === 1 ? "1 train" : `${trains} trains`} · ${cls}`,
    /** How many days a week, never which ones: the provider's day mask has an unverified order. */
    runsDays: (days: number) => (days === 7 ? "Runs every day" : days === 1 ? "Runs 1 day a week" : `Runs ${days} days a week`),
    more: "More classes and dates",
    notAsked: (classes: string) => `${classes} not asked yet`,
    notCarried: "Not carried",
    /** Which class every row carries. Said aloud because a column nobody chose reads as arbitrary. */
    leadsWith: (cls: string) => `${cls} first`,
    trainFailed: "Trakline could not answer for this train. Nothing is shown in its place.",
    /** The store has the column and nothing writes it yet, so this says so rather than inventing a number. */
    noHistory: "Not enough history yet",
  },
  lifecycle: "Availability request lifecycle",
  steps: { input: "Request entered", train: "Route resolved", chart: "Availability read", result: "Result" },
  stepStates: {
    waitingRoute: "Waiting for a route",
    waitingDate: "Waiting for a date",
    waitingRequest: "Waiting for a request",
    lookingUp: "Looking for trains",
    noTrains: (from: string, to: string) => `No trains run ${from} → ${to}`,
    chosen: (count: number, from: string, to: string) => `${count === 1 ? "1 train" : `${count} trains`}, ${from} → ${to}`,
    asked: (classes: string, quota: string, date: string) => `${classes} · ${quota} · ${date}`,
    reading: "Asking the route",
    returned: (count: number, time: string) => `${count === 1 ? "1 train" : `${count} trains`} answered at ${time} IST`,
    refused: (time: string) => `Refused at ${time} IST`,
    notReached: "Not reached — nothing was asked",
    shownAbove: "Shown above",
    none: "None",
    tryAgain: "None — try again shortly",
  },
} as const satisfies MessageTree;
