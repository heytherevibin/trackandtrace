/**
 * Module 02, Sources & usage (Console Sources.dc.html). Transcribed from the sheet.
 *
 * **What the sheet draws and this cannot.** It asks for an answered-versus-failed split, a breakdown
 * of failures by cause (Timeout · Network · Server · Refused · Quota · Unreadable), the time of the
 * last failure, and a cache hit rate. **None of those is recorded anywhere.** The usage counter
 * counts calls; the breaker counts failures inside a rolling window and forgets them; no cause is
 * ever written down.
 *
 * So they are absent rather than drawn empty. A "Failed by cause" list of six zeroes says the
 * provider had a clean day; what it would actually mean is that nobody is counting. The recording
 * is its own change — it touches every provider call — and it earns its own review.
 *
 * **One plate, not two.** The sheet draws "RailKit · primary" and "RapidAPI · fallback". RapidAPI
 * was removed; its `PNR_FALLBACK` value was retired on 2026-09-27. The sheet's own "a source not
 * configured" state is the whole of what there is to say about it.
 */
export const sources = {
  pageTitle: "Sources & usage · Trakline console",
  kicker: "02 · Sources & usage",
  title: "Sources & usage",
  lead: "How each data source is answering, and how much of its quota is spent. Counts only: no PNR is ever stored.",
  updated: (time: string) => `Updated ${time} IST`,

  railkit: {
    name: "RailKit · primary",
    /** The plan, as a header meta cell. A constant: nothing reads the provider's plan back. */
    plan: "100,000 a month",
  },

  today: {
    legend: "Today, since 00:00 IST",
    requests: (n: number) => `${n} requests`,
    unknown: "The store could not say",
  },

  month: {
    legend: "This month",
    total: (used: number, plan: string) => `${used} of ${plan}`,
    average: (perDay: number) => `Average ${perDay} a day this month`,
  },

  history: {
    legend: "Last 30 days",
    /** The sheet draws a day it cannot read as a dashed box, never a bar of height nothing. */
    noData: "No data",
    day: (day: string, n: number) => `${day}: ${n} requests`,
    dayUnknown: (day: string) => `${day}: not recorded`,
  },

  /**
   * The sheet draws one breaker per source. There are three — one per caller — because a crawler's
   * refusals and a traveller's mean different things and each gets its own fuse. Drawing one would
   * mean picking which to hide.
   */
  fuses: {
    legend: "Breakers",
    caller: { pnr: "PNR checks", availability: "Availability", route: "Route search" },
    answering: "Answering",
    down: (seconds: number) => `Down · not asked for ${seconds}s`,
    downUnknown: "Down",
    /** Which fuse opened is as close to why as the store can honestly say; the reason is never written. */
    byEndpoint: "opened by failures",
    byProvider: "opened by a refused key or a spent plan",
    trips: (n: number) => `${n} trip${n === 1 ? "" : "s"} while the memory lasts`,
    window: (failures: number, asks: number) => `${failures} of ${asks} asks failed in the window`,
    unknown: "The store could not be read, so this says nothing rather than “answering”.",
  },

  /** The sheet's own state for a source this deployment does not ask. */
  notConfigured: "Not configured on this environment: this deployment asks no third-party source, so there is no quota to spend and no breaker to draw.",

  /** What the sheet asks for that nothing records. Said once, where a reader would otherwise look for it. */
  notRecorded:
    "Answered-versus-failed, the cause of each failure and the cache hit rate are not drawn: nothing records them yet. Six zeroes would read as a clean day rather than as nobody counting.",
} as const;
