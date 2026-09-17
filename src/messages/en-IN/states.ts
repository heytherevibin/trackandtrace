import type { MessageTree } from "../types";

export const states = {
  unavailable: {
    title: "No live result",
    detail: "The verified railway source did not return a result. No substitute data is shown.",
    responseLabel: "Response",
    responseValue: "Not received",
    provenanceLabel: "Provenance",
    provenanceValue: "None",
    fallbackLabel: "Fallback",
    fallbackValue: "Not used",
    badge: "Source not connected",
    policyLink: "Read the data policy",
  },
  notFound: {
    title: "No record for this PNR",
    detail: "The source answered, but has no reservation under this number. Check the digits against your ticket.",
  },
  rateLimited: {
    title: "Too many checks",
    detail: "This connection made more checks than the source allows in a minute.",
    retryIn: (seconds: number) => `Retry in ${seconds} s`,
  },
  error: {
    title: "Something broke on our side",
    detail: "The page hit an error. Nothing about your reservation was changed.",
    reference: (digest: string) => `Reference ${digest}`,
  },
  empty: {
    watchlistTitle: "Nothing saved yet",
    watchlistDetail: "Run a check and save the PNR to follow it here.",
  },
  notFoundPage: {
    title: "There is nothing at this address.",
    detail: "Looking for a PNR? Run a check here.",
    pnrTitle: "That is not a PNR",
    pnrDetail: "A PNR is ten digits. Enter the number from your ticket.",
    home: "Home",
  },
  offline: "Offline. Results cannot be fetched until the connection returns.",
  loadingResult: "Requesting railway data",
} as const satisfies MessageTree;
