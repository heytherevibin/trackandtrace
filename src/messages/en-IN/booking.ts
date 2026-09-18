import type { MessageTree } from "../types";

// Copy transcribed from the Claude Design sheet "Pre-booking B".

export const booking = {
  title: "Availability before booking",
  lead: "Pick class, quota, and date. Live availability appears here only when a timetable and inventory source is connected.",
  form: { title: "Availability request", sheet: "Form TL-02" },
  train: { label: "Train", notConnected: "Train search: not connected" },
  cls: "Class",
  quota: "Quota",
  date: "Journey date",
  submit: "Check availability",
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
  result: {
    title: "No availability returned",
    detail: "No timetable or inventory source is connected. Nothing was estimated.",
    requested: (cls: string, quota: string, date: string) => `Requested: ${cls} · ${quota} · ${date}.`,
    responseLabel: "Response",
    responseValue: "Not received",
    provenanceLabel: "Provenance",
    provenanceValue: "None",
    fallbackLabel: "Fallback",
    fallbackValue: "Not used",
  },
  lifecycle: "Availability request lifecycle",
  steps: { input: "Request entered", validate: "Request validated", source: "Inventory source", result: "Result" },
  stepStates: {
    waiting: "Waiting for a request",
    done: "Done",
    pending: "Awaiting a connected source",
    unavailable: "Unavailable until connected",
  },
} as const satisfies MessageTree;
