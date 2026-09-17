import type { MessageTree } from "../types";

export const accuracy = {
  title: "Accuracy and data policy",
  lead: "No accuracy figure is published until verified responses and confirmed outcomes exist and can be audited.",
  unavailableTitle: "Accuracy reporting is not available yet",
  unavailableDetail: "There are no verified predictions and no confirmed outcomes to compare, so nothing is estimated.",
  connectedTitle: "What is connected right now",
  evidence: {
    title: "What would have to exist first",
    rows: [
      { legend: "Live response", title: "A verified reservation response", detail: "Each record must come from a railway data source with its name and retrieval time attached." },
      { legend: "Observed outcome", title: "The final status at chart time", detail: "The confirmed, RAC, or waitlisted outcome after the chart is prepared, recorded from the same source." },
      { legend: "Audit record", title: "Both, stored side by side", detail: "Only when responses and outcomes exist together can an accuracy figure be computed and checked by anyone." },
    ],
  },
} as const satisfies MessageTree;
