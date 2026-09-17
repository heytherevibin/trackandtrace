import type { MessageTree } from "../types";

export const legal = {
  updatedLabel: "Last updated",
  updated: "17 September 2026",
  onThisPage: "On this page",
  privacy: {
    title: "Privacy",
    lead: "What this product processes, where it keeps it, and how you remove it.",
    sections: [
      { id: "processing", title: "What we process", body: "A PNR is used only to make the request to the railway data source. It is not written to our logs, and passenger names returned by the source are never stored." },
      { id: "device", title: "Recent checks and the device watchlist", body: "Recent checks and a device watchlist live in your browser's storage on this device only. You can clear them any time from the home page or the watchlist." },
      { id: "account", title: "Account data", body: "If you sign in, your email, display name, avatar, and the PNRs you save are stored with your account in Supabase, a hosted database service. Access is limited to your own records." },
      { id: "third-parties", title: "Third parties", body: "The railway data source receives the PNR you check. Supabase hosts account data. There are no advertising or analytics trackers." },
      { id: "controls", title: "Your controls", body: "Export your account data as JSON, or delete your account and every record on it, from the Account page." },
    ],
  },
  terms: {
    title: "Terms",
    lead: "Plain terms for using this tool.",
    sections: [
      { id: "what", title: "What this is", body: "An independent tool that shows the reservation fields a railway data source returns for a PNR. It is not affiliated with IRCTC or Indian Railways." },
      { id: "status", title: "Status and availability", body: "Results reflect the source's answer at the retrieval time shown. The reservation chart is final; this tool never estimates or predicts an outcome." },
      { id: "data", title: "Your data", body: "The privacy page describes what is stored and how to remove it." },
      { id: "guarantees", title: "No guarantees", body: "The service is provided as is. Sources may be unavailable, and when they are the tool says so rather than filling the gap." },
    ],
  },
} as const satisfies MessageTree;
