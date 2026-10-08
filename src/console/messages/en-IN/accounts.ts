/**
 * Module 08, Accounts (first part). Transcribed from ConsoleAccounts.dc.html and
 * ConsoleAccountsPhone.dc.html (sheet 24, approved 8 Oct 2026). Strings marked "undrawn" have no
 * board and are this file's own.
 *
 * Every address this module shows is masked until revealed. A saved PNR is never shown: only how
 * many there are. Nothing here names a data provider.
 */
export const accounts = {
  pageTitle: "Accounts · Trakline console",
  kicker: "08 · Accounts",
  title: "Accounts",
  lead: "Traveller accounts. Emails are masked, and saved PNRs are never shown.",
  updated: (time: string) => `Updated ${time} IST`,

  filters: {
    label: "Filter accounts",
    search: "Find by full email",
    hint: "Exact matches only. Results stay masked, and each lookup is written to the audit log.",
    /** Undrawn: the search applies on Enter; this is its button, for screen readers. */
    find: "Find",
    status: "Status",
    method: "Sign-in",
    created: "Created",
    all: "All",
    anyTime: "Any time",
    legend: "Filters",
    exact: "Email: exact match",
    removeExact: "Remove the filter Email: exact match",
    clear: "Clear filters",
  },

  status: { active: "Active", disabled: "Disabled" },
  methods: { email: "Email link", google: "Google", passkey: "Passkey" },
  created: { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" },

  table: {
    title: "Accounts",
    caption: "Accounts, newest sign-in first",
    email: "Email",
    created: "Created",
    lastSignIn: "Last sign-in",
    signIn: "Sign-in",
    savedPnrs: "Saved PNRs",
    news: "News",
    status: "Status",
    actions: "Actions",
    blank: "—",
    /** Undrawn: an account nobody has signed in to yet. */
    never: "Never",
    open: (email: string) => `Open the account ${email}`,
    /** The News tag is a link to the same person in Leads. */
    openLead: (news: string, email: string) => `News: ${news}. Open the lead ${email}`,
    reveal: "Reveal",
    revealLabel: (email: string) => `Reveal the address ${email}`,
    range: (from: string, to: string, total: string) => `${from}–${to} of ${total}`,
    oneMatch: "1 match",
    noMatch: "No match",
    previous: "Previous",
    next: "Next",
    emailLink: "Email link",
    google: "Google",
    passkeys: (n: number) => (n === 1 ? "1 passkey" : `${n} passkeys`),
    /** The phone board's third line. */
    savedLine: (n: number, news: string) => `${n === 0 ? "No saved PNRs" : n === 1 ? "1 saved PNR" : `${n.toLocaleString("en-IN")} saved PNRs`} · News: ${news}`,
    /** The phone board's last line. */
    datesLine: (created: string, last: string | null) => (last === null ? `Created ${created} · Never signed in` : `Created ${created} · Last sign-in ${last}`),
  },

  states: {
    noMatchTitle: "No account has that email.",
    noMatchDetail: "Search needs the whole address, exactly as it was given. The lookup was written to the audit log.",
    emptyTitle: "No accounts yet.",
    emptyDetail: "A traveller who signs in to keep a watchlist appears here.",
    /** Undrawn: filters that match nobody. */
    filteredTitle: "No account matches these filters.",
    filteredDetail: "Clear a filter to see more.",
    errorTitle: "Accounts unavailable",
    errorDetail: "The database didn't answer. Nothing was changed.",
    retry: "Try again",
  },

  record: {
    title: "Account",
    /** Undrawn: the name of the record's scrolling part, for a keyboard and a screen reader. */
    details: "Account details",
    createdOn: (date: string) => `Created ${date}`,
    revealed: "Revealed for this visit, and written to the audit log.",
    status: "Status",
    active: "Active",
    canSignIn: "Can sign in.",
    disabled: "Disabled",
    /** Since when and by whom is drawn; it arrives with Disable, which records both. Until then: */
    cannotSignIn: "Can't sign in.",
    account: "Account",
    created: "Created",
    lastSignIn: "Last sign-in",
    signIn: "Sign-in",
    savedPnrs: "Saved PNRs",
    at: (when: string) => `${when} IST`,
    sessions: "Sessions",
    signedIn: "Signed in",
    sessionCount: (n: number) => (n === 1 ? "1 session" : `${n} sessions`),
    lastSeen: "Last seen",
    nobody: "Nobody is signed in.",
    news: "News",
    openLead: "Open the lead",
    openLeadLabel: (email: string) => `Open the lead ${email}`,
    separate: "News and Account are separate facts. Disabling an account does not unsubscribe anyone.",
    /** The phone board's closing line. */
    largerScreen: "Open on a larger screen to make changes to this account.",
    private: "Saved PNRs stay private: the console shows only how many.",
    /** Undrawn. */
    unavailable: "This account's record is unavailable: the database didn't answer.",
    /** Undrawn. */
    gone: "That account is no longer here.",
  },

  errors: {
    noAccess: "Your role can't do that.",
    gone: "That account is no longer here.",
    notAddress: "Enter the whole email address, like name@example.com.",
    database: "That didn't go through: the database didn't answer. Nothing changed.",
  },
} as const;
