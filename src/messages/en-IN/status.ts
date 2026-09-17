import type { MessageTree } from "../types";

export const status = {
  short: {
    CNF: "Confirmed",
    RAC: "RAC",
    WL: "Waitlist",
    CANCELLED: "Cancelled",
    NOT_FOUND: "Not found",
  },
  withPosition: (code: "RAC" | "WL", position: number) => `${code} ${position}`,
  long: {
    CNF: "Confirmed: a berth is allotted.",
    RAC: "Reservation against cancellation: you may board; a full berth is allotted only if someone cancels.",
    WL: "Waitlisted: no berth yet. The chart decides.",
    CANCELLED: "Cancelled: this reservation is no longer valid.",
    NOT_FOUND: "The source returned no record for this PNR.",
  },
  aspect: {
    go: "Go",
    watch: "Watch",
    stop: "Stop",
    neutral: "Off",
  },
} as const satisfies MessageTree;
