/**
 * Module 06, Leads (first part). Transcribed from ConsoleLeads.dc.html and ConsoleLeadsPhone.dc.html
 * (sheet 22, approved 4 Oct 2026). Strings marked "undrawn" have no board and are this file's own.
 *
 * Every address this module shows is masked until revealed. Nothing here names a data provider.
 */
const count = (n: string, one: string, many: string) => (n === "1" ? `1 ${one}` : `${n} ${many}`);

export const leads = {
  pageTitle: "Leads · Trakline console",
  kicker: "06 · Leads",
  title: "Leads",
  lead: "Everyone who gave us an email: sign-ups and accounts. Console members are left out.",
  updated: (time: string) => `Updated ${time} IST`,

  figures: {
    title: "Lifecycle",
    total: (n: string) => count(n, "lead", "leads"),
    pending: "Pending confirmation",
    subscribed: "Subscribed",
    unsubscribed: "Unsubscribed",
    suppressed: "Suppressed",
    accounts: "With an account",
    availability: "Availability list",
    note: "News and Account are separate facts. An account never makes anyone subscribed.",
    /** Undrawn. */
    unavailable: "Figures unavailable: the database didn't answer.",
  },

  filters: {
    label: "Filter leads",
    search: "Find by full email",
    hint: "Exact matches only. Results stay masked, and each lookup is written to the audit log.",
    /** Undrawn: the search applies on Enter; this is its button, for screen readers. */
    find: "Find",
    news: "News",
    account: "Account",
    source: "Source",
    seen: "First seen",
    all: "All",
    anyTime: "Any time",
    legend: "Filters",
    exact: "Email: exact match",
    removeExact: "Remove the filter Email: exact match",
    clear: "Clear filters",
  },

  news: { pending: "Pending confirmation", subscribed: "Subscribed", unsubscribed: "Unsubscribed", suppressed: "Suppressed", none: "Not subscribed" },
  account: { none: "No account", has: "Has account", disabled: "Disabled" },
  sources: { footer: "Footer", landing: "Landing", "pre-booking": "Pre-booking", account: "Account", "added by hand": "Added by hand" },
  seen: { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" },

  table: {
    title: "Leads",
    caption: "Leads, newest activity first",
    email: "Email",
    news: "News",
    lists: "Lists",
    account: "Account",
    source: "Source",
    campaign: "Campaign",
    firstSeen: "First seen",
    lastActivity: "Last activity",
    actions: "Actions",
    availability: "Availability",
    blank: "—",
    open: (email: string) => `Open the lead ${email}`,
    reveal: "Reveal",
    revealLabel: (email: string) => `Reveal the address ${email}`,
    range: (from: string, to: string, total: string) => `${from}–${to} of ${total}`,
    oneMatch: "1 match",
    noMatch: "No match",
    previous: "Previous",
    next: "Next",
    firstSeenLine: (date: string, source: string) => `First seen ${date} · ${source}`,
  },

  states: {
    noMatchTitle: "No lead has that email.",
    noMatchDetail: "Search needs the whole address, exactly as it was given. The lookup was written to the audit log.",
    emptyTitle: "No leads yet.",
    emptyDetail: "Sign-ups from the footer, the landing page and pre-booking land here.",
    /** Undrawn: filters that match nobody. */
    filteredTitle: "No lead matches these filters.",
    filteredDetail: "Clear a filter to see more.",
    errorTitle: "Leads unavailable",
    errorDetail: "The database didn't answer. Nothing was changed.",
    retry: "Try again",
  },

  record: {
    title: "Lead",
    /** Undrawn: the name of the record's scrolling part, for a keyboard and a screen reader. */
    details: "Lead details",
    firstSeen: (date: string) => `First seen ${date}`,
    revealed: "Revealed for this visit, and written to the audit log.",
    subscriptions: "Subscriptions",
    lists: { news: "News", availability: "Availability" },
    consented: (when: string, via: string, notice: string) => `Consented ${when} IST via ${via} · notice v${notice}`,
    confirmed: (when: string) => ` · confirmed ${when} IST`,
    /** Undrawn. */
    notConfirmed: " · not confirmed yet",
    /** Undrawn. */
    withdrawn: (when: string) => ` · unsubscribed ${when} IST`,
    notOnList: "Not on this list.",
    via: { footer: "the footer form", landing: "the landing page", "pre-booking": "the pre-booking form", account: "their account", "added by hand": "an operator" },
    accountTitle: "Account",
    created: "Created",
    lastSignIn: "Last sign-in",
    signIn: "Sign-in",
    savedPnrs: "Saved PNRs",
    at: (when: string) => `${when} IST`,
    /** Undrawn. */
    never: "Never",
    emailLink: "Email link",
    google: "Google",
    passkeys: (n: number) => (n === 1 ? "1 passkey" : `${n} passkeys`),
    pnrs: (n: string) => `${n}. The console never shows them.`,
    /** Undrawn. */
    noAccount: "No account.",
    /** Undrawn. */
    disabled: "This account is disabled.",
    campaignTitle: "Campaign",
    source: "Source",
    medium: "Medium",
    campaign: "Campaign",
    firstPage: "First page",
    /** Undrawn. */
    noCampaign: "No campaign recorded.",
    timeline: "Timeline",
    events: {
      signed_up: (list: string, via: string) => `Signed up for ${list} via ${via}`,
      confirmed: (list: string) => `Confirmed ${list}`,
      unsubscribed: (list: string) => `Unsubscribed from ${list}`,
      account_created: "Created an account",
      signed_in: "Last signed in",
      received: (subject: string) => `Received “${subject}”`,
      /** Undrawn. */
      suppressed: "Suppressed: mail can no longer reach this address",
    },
    retention: "A sign-up that is never confirmed is deleted after 7 days.",
    /** Undrawn. */
    unavailable: "This lead's record is unavailable: the database didn't answer.",
    /** Undrawn. */
    gone: "That lead is no longer here.",
  },

  errors: {
    noAccess: "Your role can't do that.",
    gone: "That lead is no longer here.",
    notAddress: "Enter the whole email address, like name@example.com.",
    notTag: "A tag is letters, numbers and hyphens, up to 24.",
    tooManyTags: "A lead can have 10 tags. Remove one first.",
    emptyNote: "Write the note first.",
    noteTooLong: "A note can be up to 500 characters.",
    database: "That didn't go through: the database didn't answer. Nothing changed.",
  },
} as const;
