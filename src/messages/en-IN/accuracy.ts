import type { MessageTree } from "../types";

// Copy transcribed from the Claude Design sheet "Accuracy B".

export const accuracy = {
  title: "Accuracy and data policy",
  lead: "No accuracy figure is published until verified responses and confirmed outcomes exist and can be audited.",
  status: {
    title: "Accuracy reporting is not available yet",
    detail: "There are no verified predictions and no confirmed outcomes to compare, so nothing is estimated. The ledger below opens at zero and earns every entry.",
    facts: [
      { label: "Verified records", value: "0" },
      { label: "Confirmed outcomes", value: "0" },
      { label: "Figures estimated", value: "0" },
    ],
  },
  service: { kicker: "01 · Service" },
  evidence: {
    kicker: "02 · What would have to exist first",
    rows: [
      { legend: "Live response", title: "A verified reservation response", detail: "Each record must come from a railway data source with its name and retrieval time attached." },
      { legend: "Observed outcome", title: "The final status at chart time", detail: "The confirmed, RAC, or waitlisted outcome after the chart is prepared, recorded from the same source." },
      { legend: "Audit record", title: "Both, stored side by side", detail: "Only when responses and outcomes exist together can an accuracy figure be computed and checked by anyone." },
    ],
  },
} as const satisfies MessageTree;
