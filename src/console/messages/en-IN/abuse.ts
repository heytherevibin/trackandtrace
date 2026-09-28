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

  blocked: {
    title: "Blocked",
    caption: "Addresses blocked now",
    address: "Address",
    note: "Note",
    by: "Blocked by",
    since: "Since",
    until: "Until",
    refused: "Refused since block",
    untilRemoved: "Until removed",
    at: (when: string) => `${when} IST`,
    none: "No addresses are blocked.",
    unavailable: "Blocks unavailable: the shared store didn't answer.",
    stale: (n: number) => `${n} block${n === 1 ? " was" : "s were"} made before the address key changed, and no longer match. Re-enter them or let them expire.`,
    unblock: (hash: string) => `Unblock ${hash}`,
    unblockShort: "Unblock",
    unblockSummary: (hash: string) => `Unblock ${hash}`,
    unblockHint: "Checks from this address are answered again within 30 seconds.",
    doneToast: "Unblocked.",
  },

  block: {
    trigger: "Block an address",
    rowTrigger: (hash: string) => `Block ${hash}`,
    rowShort: "Block",
    form: "Checks from it are refused as if it had hit the limit.",
    addressLabel: "IP address",
    addressLegend: "One IPv4 address, or an IPv6 address; for IPv6 the whole /64 network is blocked. We hash it on entry and never store it.",
    durationLabel: "Duration",
    durations: { "1h": "1 hour", "24h": "24 hours", "7d": "7 days", removed: "Until removed" },
    noteLabel: "Note",
    continue: "Continue",
    summary: (hash: string) => `Block ${hash}`,
    changeLabel: "Blocked",
    notBlocked: "No",
    hint: "Checks from this address are refused within 30 seconds, on every server.",
    doneToast: "Blocked.",
  },

  /** The brief's own "store unavailable" state. */
  storeUnavailable: "Limits are per server until the shared store answers.",
  localOnly: "No shared store is configured: limits and counts are this server's alone.",

  errors: {
    /** console.use_tap's own 'no tap for this action': the four fields re-digested differ from those minted. */
    tapMismatch: "That tap was for a different change. Try again.",
    noAccess: "Blocking is for Owners and Admins.",
    invalid: "Enter one IPv4 or IPv6 address.",
    database: "The console could not reach its database. Nothing changed.",
    notBlocked: "Not blocked: the shared store didn't answer. Nothing changed.",
    notUnblocked: "Not unblocked: the shared store didn't answer. The block is still in force.",
  },

} as const;
