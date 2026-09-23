import type { MessageTree } from "../types";

// What a traveller reads when the reservation service cannot give a record. One neutral voice for
// every provider: no provider name, key, plan or HTTP detail ever reaches the page.
export const source = {
  outcomes: {
    timeout: "The reservation service did not answer in time. Nothing was shown in its place.",
    unreachable: "The reservation service could not be reached. Nothing was shown in its place.",
    refused: "The reservation service is unavailable right now. Nothing was shown in its place.",
    busy: "The reservation service is busy right now. Try again shortly.",
    resting: "The reservation service is not answering right now. Try again shortly.",
    dailyLimit: "Trakline has used today's live checks. Try again after 00:00 IST.",
    error: "The reservation service returned an error. Nothing was shown in its place.",
    unreadable: "The reservation service returned a record this app cannot read. Nothing was shown in its place.",
    couldNotAnswer: "The reservation service could not answer for this PNR. Nothing was shown in its place.",
    noRecord: "There is no reservation record for this PNR.",
  },
  // Seat availability, asked before a ticket exists. Every sentence here means "we could not ask" or
  // "check what you gave us" — none of them may ever be read as "there are no berths left", because
  // a traveller acts on that. A real sold-out day is an answer and carries the day's own words.
  availability: {
    couldNotAnswer: "The reservation service could not answer for this journey. Nothing was shown in its place.",
    notOnRoute: "This train does not run between those two stations. Check the stations and try again.",
    dateNotAccepted: "That journey date could not be read. Nothing was shown in its place.",
    invalidRequest: "That journey could not be checked. Check the train number, the stations and the date.",
  },
} as const satisfies MessageTree;
