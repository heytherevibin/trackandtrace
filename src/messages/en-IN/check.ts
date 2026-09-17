import type { MessageTree } from "../types";

export const check = {
  label: "PNR number",
  helper: "The 10 digits printed top-left on your ticket, or in your booking SMS.",
  progress: (n: number) => `${n} of 10 digits`,
  ready: "Ready. Press Run.",
  errorIncomplete: "Enter all 10 digits.",
  errorInvalid: "Enter a valid 10-digit PNR.",
  submit: "Run",
  submitting: "Running",
  clear: "Clear the PNR",
  groups: { one: "1–3", two: "4–6", three: "7–10" },
  stages: {
    input: "Input",
    validate: "Validate",
    source: "Source",
    result: "Result",
  },
  readoutLabel: (digits: string) => (digits.length > 0 ? `PNR readout showing ${digits}` : "PNR readout, empty"),
} as const satisfies MessageTree;
