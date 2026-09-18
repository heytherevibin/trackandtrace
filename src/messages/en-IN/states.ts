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
  /** The request lifecycle drawn under an unavailable result, as the Pre-booking sheet draws it. */
  lifecycle: {
    legend: "PNR request lifecycle",
    steps: { input: "Request entered", validate: "Request validated", source: "Railway source", result: "Result" },
    details: {
      input: (formatted: string) => `PNR ${formatted}`,
      validate: "Ten digits",
      source: "No verified source answered",
      result: "Unavailable until a source answers",
    },
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
    plateTitle: "This page did not load",
    plateDetail: "Retry to load it again. No result was shown in its place.",
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
    terminalTitle: "PNR check — live request",
    terminalForm: "Form TL-01",
  },
  offline: "Offline. Results cannot be fetched until the connection returns.",
  offlinePage: {
    title: "Offline",
    lead: "Results cannot be fetched until the connection returns.",
    plateTitle: "No connection",
    plateDetail: "This device is not reaching the network, so no request was sent. Nothing cached is shown in place of a result.",
  },
  loadingResult: "Requesting railway data",
} as const satisfies MessageTree;
