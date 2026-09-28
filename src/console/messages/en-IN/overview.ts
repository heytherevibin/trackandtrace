/**
 * Module 01, Overview (Console Overview.dc.html). Transcribed from the sheet where the sheet's figure
 * is recorded somewhere; said plainly where it is not.
 *
 * **Four plates of the eight.** Service now, Checks today, Quota this month and Recent actions are
 * drawn. Urgent actions is not: nothing wires a pause to the PNR checks, and a "Pause PNR checks"
 * button that paused nothing would tell an operator the site had stopped when it had not. Queues,
 * People and Open incident read tables that do not exist yet (modules 06–10 and 03).
 *
 * **Service now has four rows of the sheet's seven.** RapidAPI was removed on 2026-09-27; Email and
 * the Status probe arrive with Phases 4 and 3. No row carries a "since" time: nothing records when a
 * state began, and the spec says times appear only where they are known.
 */
export const overview = {
  pageTitle: "Overview · Trakline console",
  kicker: "01 · Overview",
  title: "Overview",
  lead: "What travellers are getting right now, and what needs you.",
  meta: (time: string) => `Updated ${time} IST · refreshes every minute`,

  service: {
    title: "Service now",
    names: { checks: "PNR checks", primary: "RailKit (primary)", store: "Shared store", accounts: "Accounts" },
    words: {
      answering: "Answering",
      degraded: "Degraded",
      down: "Down",
      connected: "Connected",
      notAnswering: "Not answering",
      cannotSay: "Cannot say",
      notConfigured: "Not configured",
      thisInstance: "This instance only",
    },
    budgetUsed: "Today's live-check budget is used; answering from recent results",
    budgetUnknown: "The shared store didn't answer, so today's live-check budget cannot be read.",
    fusesUnknown: "The shared store didn't answer, so the breakers cannot be read.",
    openUntil: (time: string) => `Breaker open until ${time} IST`,
    openUntilFor: (caller: string, time: string) => `${caller}: breaker open until ${time} IST`,
    openFor: (caller: string) => `${caller}: breaker open`,
    noSource: "This deployment asks no third-party source.",
    thisInstanceNote: "No shared store is configured: counts and breakers live in this server's memory alone.",
  },

  checks: {
    title: "Checks today",
    since: "Since 00:00 IST",
    budget: "Live-check budget",
    budgetOf: (used: string, limit: string) => `${used} of ${limit} today`,
    unavailable: "Counts unavailable: the shared store didn't answer.",
    noBudget: "No live-check budget on this deployment: it asks no third-party source.",
    /** Said once, where a reader would otherwise look for the four figures the sheet draws. */
    notRecorded:
      "Checks, from cache, live and unavailable are not drawn: nothing counts checks by outcome yet. Four zeroes would read as a quiet day rather than as nobody counting.",
  },

  quota: {
    title: "Quota this month",
    railkit: "RailKit",
    of: (used: string, plan: string, resets: string) => `${used} of ${plan} · resets ${resets}`,
    unavailable: "Counts unavailable: the shared store didn't answer.",
    unreadDays: (n: number) => `${n} day${n === 1 ? "" : "s"} this month could not be read and ${n === 1 ? "is" : "are"} not in the total.`,
    notConfigured: "No quota on this deployment: it asks no third-party source.",
  },

  recent: {
    title: "Recent actions",
    lastFive: "Last five",
    caption: "The last five audit entries",
    time: "Time",
    member: "Member",
    action: "Action",
    at: (when: string) => `${when} IST`,
    open: "Open audit log",
    empty: "Nothing recorded yet.",
    unreadable: "The audit log could not be read.",
  },

  notDrawn:
    "Urgent actions, queues, people and open incidents are not drawn yet: nothing they would show is recorded, and a pause button that paused nothing would be worse than none.",
} as const;
