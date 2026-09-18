import type { MessageTree } from "../types";
import { common } from "./common";

// The check plate ("PNR check — live request", Form TL-01), transcribed from Landing Redesign B.

const PARTY_WORDS: Readonly<Record<number, string>> = { 2: "two", 3: "three", 4: "four", 5: "five", 6: "six" };

export const check = {
  label: "PNR number",
  counter: (n: number) => `${n} / 10`,
  progress: (n: number) => `${n} of 10 digits`,
  hints: {
    idle: "The 10 digits printed top-left on your ticket, or in your booking SMS.",
    idleSample: "The 10 digits printed top-left on your ticket, or in your booking SMS. Try a sample: 2345678909.",
    ready: "Ready. Press Run — one live request, made the moment you press it.",
    running: "Running · validate → source → result",
  },
  errorIncomplete: "Enter all 10 digits.",
  errorInvalid: "Enter a valid 10-digit PNR.",
  lamp: {
    idle: "Standing by",
    ready: "Ready to run",
    running: "Requesting source",
    invalid: "Check the digits",
  },
  submit: "Run",
  submitting: "Running…",
  clear: "Clear",
  groups: { one: "1–3", two: "4–6", three: "7–10" },
  plate: {
    title: "PNR check — live request",
    form: "Form TL-01",
  },
  result: {
    pnr: (formatted: string) => `PNR ${formatted}`,
    party: (codes: string, count: number) => `${codes} — party of ${PARTY_WORDS[count] ?? String(count)}`,
    another: "Check another PNR",
    openRecord: "Open full record →",
    announce: (status: string, formatted: string) => `${status}. PNR ${formatted}.`,
    facts: {
      train: "Train",
      route: "Route",
      journey: "Journey",
      classQuota: "Class · quota",
      departs: "Departs",
      coachBerth: "Coach · berth",
      chart: "Chart",
    },
    values: {
      route: (from: string, to: string) => `${from} → ${to}`,
      pair: (a: string, b: string) => `${a} · ${b}`,
      departs: (time: string) => `${time} IST`,
      chart: (time: string) => `~${time} IST`,
      chartPrepared: "Prepared",
      chartNotPrepared: "Not prepared",
    },
    passengers: {
      caption: "Passengers on this booking",
      passenger: "Passenger",
      booked: "Booked",
      current: "Current",
      allocation: "Coach · berth",
      nth: (i: number) => `Passenger ${i}`,
      notAllocated: "Not allocated",
    },
    codes: {
      CNF: "CNF",
      RAC: "RAC",
      WL: "WL",
      CANCELLED: "Cancelled",
      NOT_FOUND: "Not found",
    },
    withPosition: (code: string, position: number) => `${code} ${position}`,
    recentLabel: (train: string, from: string, to: string, date: string) => `${train} · ${from}→${to} · ${date}`,
    sources: { live: common.productName, fixture: "the development fixture" },
    provenance: {
      retrieved: (time: string, source: string) => `Retrieved ${time} IST from ${source} · every field as returned, none invented`,
      retrievedOnly: (time: string, source: string) => `Retrieved ${time} IST from ${source}`,
      silent: (time: string) => `Attempted ${time} IST · no verified source answered`,
      noAnswer: (time: string) => `Attempted ${time} IST · ${common.productName} did not answer`,
      heldBack: (time: string) => `Attempted ${time} IST · held back, nothing sent to the source`,
      refused: (time: string) => `Attempted ${time} IST · refused before the source`,
    },
    notFound: {
      short: "Not found",
      big: "No record at the source",
      long: "The source returned no reservation record for this PNR. Check the digits against your ticket or booking SMS.",
    },
    unavailable: {
      short: "Source silent",
      big: "Source not connected",
      long: "No verified railway source is connected right now, so this product makes no claim about this PNR. It fails closed: no source, no invented result.",
      connectedBig: "No answer from the service",
    },
    limited: {
      short: "Held back",
      big: "Too many checks",
      long: (retry: string) => `This connection made more checks than the source allows in a minute, so no request was sent and nothing is shown.${retry}`,
      retry: (seconds: number) => ` Retry in ${seconds} s.`,
      retryLater: " Retry in a minute.",
    },
    refused: {
      short: "Refused",
      big: "Not a valid PNR",
      long: "The service refused this number as a PNR, so no request was sent. Check the 10 digits against your ticket or booking SMS.",
    },
  },
  recent: {
    title: "Recent on this device",
    clear: "Clear",
    listLabel: "Recent checks on this device",
  },
} as const satisfies MessageTree;
