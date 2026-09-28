/**
 * Module 04, Abuse & limits (b3-provider-operations.md, "Console Abuse"). Transcribed from the brief;
 * there is no drawn sheet for this module.
 *
 * **Two of the three plates, and no primary.** Blocking is its own change (the owner's call,
 * 2026-09-28): it needs a blocklist every traveller request consults, and until one exists a
 * "Block an address" button would stop nobody. So this draws Limits and Most limited today, and says
 * once what is not here yet.
 */
export const abuse = {
  pageTitle: "Abuse & limits · Trakline console",
  kicker: "04 · Abuse & limits",
  title: "Abuse & limits",
  lead: "Addresses that hit the limit or were blocked. Addresses are stored as hashes; nobody here sees an IP.",

  limits: {
    title: "Limits",
    rule: (perMinute: number) => `${perMinute} checks per minute per address (IPv6: per /64 network)`,
    live: (used: string, limit: string) => `Live checks today: ${used} of ${limit}`,
    liveUnknown: "Live checks today: the shared store didn't answer.",
    noBudget: "No live-check budget on this deployment: it asks no third-party source.",
    limited: (n: string) => `Limited today: ${n}`,
    limitedUnknown: "Limited today: the shared store didn't answer.",
    change: "Change in Switches & settings",
  },

  mostLimited: {
    title: "Most limited today",
    caption: "The addresses refused most often today",
    address: "Address",
    times: "Times limited",
    first: "First seen",
    last: "Last seen",
    ipv6: "IPv6 /64",
    at: (time: string) => `${time} IST`,
    quiet: "No address hit the limit today.",
    unavailable: "Counts unavailable: the shared store didn't answer.",
  },

  /** The brief's own "store unavailable" state. */
  storeUnavailable: "Limits are per server until the shared store answers.",
  localOnly: "No shared store is configured: limits and counts are this server's alone.",

  notDrawn: "Blocking an address is not here yet: nothing enforces a block until the blocklist lands, and a Block button that stopped nobody would be worse than none.",
} as const;
