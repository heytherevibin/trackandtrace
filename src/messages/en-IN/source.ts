import type { MessageTree } from "../types";

export const source = {
  table: {
    caption: "Data sources and their connection state",
    dataSet: "Data set",
    usedFor: "Used for",
    state: "State",
  },
  rows: {
    reservation: { name: "Reservation status", use: "PNR result" },
    inventory: { name: "Timetable and inventory", use: "Pre-booking" },
    outcomes: { name: "Outcome history", use: "Accuracy" },
    accounts: { name: "Account storage", use: "Watchlist sync" },
  },
  states: {
    connected: "Connected",
    notConnected: "Not connected",
    noRecords: "No verified records",
    sample: "Sample data (development)",
    thirdParty: "Connected · RapidAPI (third-party)",
  },
} as const satisfies MessageTree;
