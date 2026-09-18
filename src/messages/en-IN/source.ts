import type { MessageTree } from "../types";

// What a traveller reads when the reservation service cannot give a record. One neutral voice for
// every provider: no provider name, key, plan or HTTP detail ever reaches the page.
export const source = {
  outcomes: {
    timeout: "The reservation service did not answer in time. Nothing was shown in its place.",
    unreachable: "The reservation service could not be reached. Nothing was shown in its place.",
    refused: "The reservation service is unavailable right now. Nothing was shown in its place.",
    busy: "The reservation service is busy right now. Try again shortly.",
    error: "The reservation service returned an error. Nothing was shown in its place.",
    unreadable: "The reservation service returned a record this app cannot read. Nothing was shown in its place.",
    couldNotAnswer: "The reservation service could not answer for this PNR. Nothing was shown in its place.",
    noRecord: "There is no reservation record for this PNR.",
  },
} as const satisfies MessageTree;
