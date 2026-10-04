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
    tag: "Tag",
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
    tags: "Tags",
    /** The tags a row has no room to draw, after its first. */
    moreTags: (n: number) => `+${n}`,
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
      /** The name is whoever added it, as their name stood; undrawn without one. */
      added_by_hand: (by: string | null) => (by ? `Added by hand by ${by}` : "Added by hand"),
    },
    tags: "Tags",
    /** Undrawn. */
    noTags: "No tags.",
    addTag: "Add a tag",
    add: "Add",
    tagHint: "Letters, numbers and hyphens, up to 24. A new tag is created the first time it is used.",
    removeTag: (tag: string) => `Remove the tag ${tag}`,
    notes: "Notes",
    noNotes: "No notes yet.",
    noteBy: (author: string, when: string) => `${author} · ${when} IST`,
    addNote: "Add a note",
    noteHint: "Don't include PNRs, emails or IP addresses; they're removed. Up to 500 characters. A note can't be changed afterwards.",
    addNoteButton: "Add note",
    /** The phone board's closing line. */
    largerScreen: "Open on a larger screen to make changes to this lead.",
    retention: "A sign-up that is never confirmed is deleted after 7 days.",
    /** Undrawn. */
    unavailable: "This lead's record is unavailable: the database didn't answer.",
    /** Undrawn. */
    gone: "That lead is no longer here.",
  },

  /** What a reason-and-key act says when the database refuses it. Undrawn; the audit log's own words. */
  confirm: {
    tapMismatch: "That confirmation no longer matches this action. Try again.",
    refused: "The console wouldn't do that. Reload the page and try again.",
  },

  export: {
    action: "Export CSV",
    /** The phone board's line: nothing is exported from a phone. */
    phone: "Open on a larger screen to export.",
    /** Singular undrawn. */
    summary: (n: string) => (n === "1" ? "Export 1 lead" : `Export ${n} leads`),
    hint: "The file holds whole addresses, with each lead's status, source, campaign and tags. It works once, in this browser, for 10 minutes.",
    preparing: (n: string) => (n === "1" ? "Preparing export… 1 lead." : `Preparing export… ${n} leads.`),
    works: "Works once, in this browser, for 10 minutes",
    download: "Download",
    /** Undrawn. */
    tooMany: (max: number) => `That's more than ${max.toLocaleString("en-IN")} leads. Narrow the filters and try again.`,
    /** Undrawn: the list could not be read, so there is nothing to count. */
    unavailable: "Leads couldn't be read, so there is nothing to export yet.",
  },

  remove: {
    title: "Delete",
    detail: "Removes this person, their consents, tags and notes. They can sign up again.",
    action: "Delete lead",
    hasAccount: "This lead has an account, so it can't be deleted here.",
    summary: (email: string) => `Delete the lead ${email}`,
    hint: (consents: number, tags: number, notes: number) =>
      `This removes the person, ${consents === 1 ? "their consent" : `their ${consents} consents`}, ${tags === 1 ? "1 tag" : `${tags} tags`} and ${notes === 1 ? "1 note" : `${notes} notes`}. A suppression on the address stays. They can sign up again.`,
    /** Undrawn. */
    done: "Lead deleted.",
  },

  /**
   * Business leads (sheet 22, part three). "About" is the brief's "Note": the record already has
   * Notes, and this is the one line a card shows.
   */
  business: {
    add: "Add a business lead",
    form: "Form TC-09",
    markTitle: "Mark as a business enquiry",
    email: "Email",
    lead: "Lead",
    name: "Name (optional)",
    organisation: "Organisation (optional)",
    about: "About",
    aboutHint: "One line, shown on the card. Don't include PNRs, emails or IP addresses; they're removed. Up to 120 characters.",
    owner: "Owner",
    addLegend: "Added by hand for a business conversation. Never added to any email list unless they sign up themselves.",
    markLegend: "Nothing about this lead’s subscriptions changes. It is never added to any email list unless they sign up themselves.",
    cancel: "Cancel",
    addAction: "Add lead",
    markAction: "Mark as a business enquiry",
    /** Undrawn: the three ways a form can end well. */
    added: "Business lead added.",
    marked: "Marked as a business enquiry.",
    existing: "Already a lead. Marked as a business enquiry.",
    section: "Business enquiry",
    notIn: "Not in the pipeline.",
    stage: "Stage",
    stages: { new: "New", contacted: "Contacted", qualified: "Qualified", won: "Won", lost: "Lost" },
    nameLabel: "Name",
    organisationLabel: "Organisation",
    /** Undrawn: a lead whose owner has left the console. */
    nobody: "Nobody",
    remove: "Remove from pipeline",
    removeTitle: "Remove from the pipeline?",
    removeDetail: "The lead stays in Leads, with its tags and notes. Its stage, owner, name, organisation and the line about it are removed.",
    removeConfirm: "Remove",
    /** Undrawn. */
    removed: "Removed from the pipeline.",
    kept: "A business lead is kept until it is deleted.",
    /** Undrawn, all of them. */
    errors: {
      member: "That address belongs to a console member.",
      aboutEmpty: "Say one line about this lead.",
      aboutLong: "The line about a lead can be up to 120 characters.",
      nameLong: "A name or an organisation can be up to 80 characters.",
      notOwner: "That member can't own a lead.",
      already: "That lead is already in the pipeline.",
      notIn: "That lead is no longer in the pipeline.",
    },
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
