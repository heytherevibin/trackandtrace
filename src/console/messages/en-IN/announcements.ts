/**
 * Module 07, Announcements. Transcribed from ConsoleAnnouncements.dc.html and
 * ConsoleAnnouncementsPhone.dc.html (sheet 23, approved 4 Oct 2026). Strings marked "undrawn" have
 * no board and are this file's own; the README's B4 section lists the Queued ones.
 *
 * The provider is never named: it is "the mail service". Nothing here states how often the news
 * list is written to.
 */
const people = (n: string) => (n === "1" ? "1 person" : `${n} people`);
const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

export const announcements = {
  pageTitle: "Announcements · Trakline console",
  kicker: "07 · Announcements",
  title: "Announcements",
  lead: "Letters to the people who asked for them. A send goes out over several days, so confirmation and sign-in mail always have room.",
  updated: (time: string) => `Updated ${time} IST`,
  newLetter: "New letter",
  allLetters: "All letters",

  lists: { news: "News", availability: "Availability" },
  states: { draft: "Draft", queued: "Queued", sending: "Sending", stopped: "Stopped", done: "Done" },

  letters: {
    title: "Letters",
    count: (n: number) => (n === 1 ? "1 letter" : `${n} letters`),
    caption: "Letters to the subscription lists",
    subject: "Subject",
    list: "List",
    state: "State",
    progress: "Progress",
    when: "When",
    notQueued: "Not queued",
    line: (sent: string, skipped: string, unknown: string, total: string) => `Sent ${sent} · Skipped ${skipped} · Unknown ${unknown} of ${total}`,
    saved: (date: string) => `Saved ${date}`,
    queued: (date: string) => `Queued ${date}`,
    stopped: (date: string) => `Stopped ${date}`,
    finished: (date: string) => `Finished ${date}`,
    open: (subject: string) => `Open ${subject}`,
    /** Undrawn, with Delete: the owner asked for it on 2026-10-04. The column's header is for screen readers only. */
    actions: "Actions",
    delete: "Delete",
    deleteLabel: (subject: string) => `Delete the draft ${subject}`,
    footer: "A letter goes out at most 40 a day. We don't track opens or clicks.",
    /** Undrawn: the sheet's sample always has letters. */
    none: "No letters yet. New letter starts one.",
    /** Undrawn. */
    unavailable: "Letters unavailable: the database didn't answer.",
  },

  compose: {
    title: "New letter",
    draft: "Draft",
    form: "Form TC-10",
    subject: "Subject",
    list: "List",
    body: "Body",
    bodyHint: "Plain text. The unsubscribe link is added for you at the end of every email.",
    confirmed: (n: string) => `${people(n)} confirmed. Anyone unsubscribed or suppressed is left out.`,
    spentOn: (date: string) => `Spent. Its one send finished on ${date}, and it can't be chosen again.`,
    /** Undrawn: the one send is still going out. */
    spentGoing: "Spent. Its one send is going out, and it can't be chosen again.",
    test: {
      legend: "Test send",
      detail: (email: string) => `Sends this letter to ${email}, using one email from today's allowance.`,
      notSent: "Not sent yet",
      sentAt: (time: string, email: string) => `Sent at ${time} IST to ${email}`,
      /** Undrawn: a test made on an earlier day. */
      sentOn: (when: string, email: string) => `Sent ${when} IST to ${email}`,
      send: "Send a test to me",
      done: "Test sent.",
    },
    notTested: "A test send has not been made.",
    /** Undrawn (ruling 6). */
    unsaved: "Save your changes first.",
    /** Undrawn (ruling 8). */
    nobody: "Nobody is on this list yet.",
    ready: (n: string, d: number) => `Queue sends to ${people(n)}, about ${days(d)} at 40 a day.`,
    readyBehind: (n: string, d: number) => `Queue sends to ${people(n)}, about ${days(d)} at 40 a day, after the letter ahead.`,
    save: "Save draft",
    saved: "Draft saved.",
    queue: "Queue",
    queued: "Queued.",
    /** Undrawn: field errors. */
    subjectNeeded: "Enter a subject.",
    subjectTooLong: "A subject can be up to 200 characters.",
    bodyNeeded: "Write the letter's body.",
    bodyTooLong: "A body can be up to 20,000 characters.",
  },

  how: {
    title: "How a letter goes out",
    items: [
      "At most 40 a day, so confirmation and sign-in mail keep their room.",
      "Queue fixes who gets it: the people on the list at that moment. Someone who unsubscribes before their turn is skipped.",
      "Stop halts the rest at once. A stopped letter can't be resumed.",
      "We don't track opens or clicks.",
    ],
  },

  queueDialog: {
    title: "Queue this letter?",
    list: "List",
    subject: "Subject",
    people: "People",
    behind: "Behind",
    takes: "Takes",
    finishes: "Finishes",
    behindOne: (subject: string, d: number) => `${subject}, about ${days(d)} left`,
    /** Undrawn: more than one letter ahead. */
    behindMany: (subject: string, more: number, d: number) => `${subject} and ${more} more, about ${days(d)} left`,
    takesNow: (d: number) => `About ${days(d)} at 40 a day`,
    takesBehind: (d: number) => `About ${days(d)} at 40 a day, starting when that one finishes`,
    around: (date: string) => `Around ${date}`,
    detail: "Once queued, the letter goes to real people. You can stop it, but a stopped letter can't be resumed.",
    confirm: "Queue",
  },

  detail: {
    progress: "Progress",
    estimated: "Estimated finish",
    about: (d: number) => `About ${days(d)} at 40 a day`,
    aroundDetail: (date: string) => `Around ${date}. If confirmation mail uses up a day first, nothing from this letter goes that day and the finish moves later.`,
    /** Undrawn, from the README's Queued note. */
    startsAfter: "Starts when the letter ahead finishes",
    /** Undrawn: queued with nothing ahead, before the day's run. */
    startsNext: "Starts at the next daily run",
    stoppedLegend: "Stopped",
    finishedLegend: "Finished",
    sentTo: (n: string) => `Sent to ${people(n)}`,
    stoppedDetail: (skipped: string, never: string, when: string, by: string) => `${skipped} were skipped, and ${never} were never reached and won't be. Stopped on ${when} IST by ${by}.`,
    finishedDetail: (when: string, skipped: string) => `Finished on ${when} IST. ${skipped} were skipped.`,
    finishedUnknown: (n: string) => ` ${n} may or may not have gone.`,
    availabilitySpent: " The availability list is spent: it had its one send and can't be chosen again.",
    meter: "Recipients handled",
    handled: (h: string, t: string) => `${h} of ${t} handled`,
    waiting: (n: string) => `${n} waiting`,
    neverReached: (n: string) => `${n} never reached`,
    sent: "Sent",
    sentHint: "Accepted by the mail service for delivery.",
    skipped: "Skipped",
    skippedHint: "Left out when their turn came: unsubscribed or suppressed since the letter was queued.",
    unknown: "Unknown",
    unknownHint: "May or may not have gone: the send timed out. These are never tried again.",
    stopNote: "Stop halts the rest at once. What has gone has gone, and a stopped letter can't be resumed.",
    stop: "Stop",
    cantResume: "A stopped letter can't be resumed.",
    letter: "Letter",
    listCell: (list: string, n: string) => `${list} · ${people(n)}`,
    subjectRow: "Subject",
    listRow: "List",
    listWhenQueued: (list: string, n: string) => `${list} · ${people(n)} when it was queued`,
    queuedRow: "Queued",
    by: (when: string, name: string) => `${when} IST by ${name}`,
    /** Undrawn: the member has since been removed. */
    byNobody: (when: string) => `${when} IST`,
    formerMember: "a former member",
    testRow: "Test send",
    testTo: (when: string, email: string) => `${when} IST to ${email}`,
    todayRow: "Today",
    today: (n: string) => `${n} sent. The day's count resets at 05:30 IST.`,
    at: (when: string) => `${when} IST`,
    messageRow: "Message",
    messageHint: "The unsubscribe link is added to the end of every email when it is sent.",
  },

  /** Undrawn (2026-10-04). Only a draft can be deleted, and every draft has gone to nobody. */
  deleteDialog: {
    title: "Delete this draft?",
    detail: "It has gone to nobody. This can't be undone.",
    confirm: "Delete draft",
    done: "Draft deleted.",
  },

  stopDialog: {
    title: "Stop sending?",
    detail: (sent: string, waiting: string) => `${people(sent)} already have this letter, and that can't be recalled. The ${waiting} still waiting won't get it, and a stopped letter can't be resumed.`,
    /** Undrawn: stopped before the first send. "0 people already have this letter" is not a sentence. */
    detailNone: (waiting: string) => `Nobody has this letter yet. The ${waiting} waiting won't get it, and a stopped letter can't be resumed.`,
    confirm: "Stop sending",
    done: "Stopped.",
  },

  phone: {
    note: "Open on a larger screen to edit this draft, send a test or queue it.",
    title: "Draft",
    notQueued: "Not queued",
    listLine: (list: string, n: string) => `${list} · ${people(n)} confirmed`,
    message: "Message",
    queueOff: "Queue is off until a test send has been made.",
    /** Undrawn: the draft has been tested. */
    queueElsewhere: "Open on a larger screen to queue it.",
    /** Undrawn: New letter on a phone, where there is no draft to read. */
    newElsewhere: "Open on a larger screen to write a letter.",
  },

  /** The tab row above the two lists (ConsoleAnnouncements.dc.html:83-88). */
  tabs: { label: "Announcements", letters: "Letters", suppressions: "Suppressions" },

  /**
   * Suppressions (ConsoleAnnouncements.dc.html, Suppressions and both Lift confirms). The store
   * names the mail provider in one reason; nothing here does.
   */
  suppressions: {
    pageTitle: "Suppressions · Announcements · Trakline console",
    title: "Suppressed addresses",
    count: (n: number) => (n === 1 ? "1 address" : `${n} addresses`),
    caption: "Addresses we no longer send to",
    address: "Address",
    scope: "Scope",
    reason: "Reason",
    when: "When",
    source: "Source",
    actions: "Actions",
    scopes: { all: "All", list: "List mail" },
    operator: "Operator",
    reasons: {
      hardBounce: "Hard bounce",
      complaint: "Spam complaint",
      delayed: "Delayed three times in 30 days",
      /** Undrawn: the sheet's sample gives this row "Hard bounce", which the store does not record for it. */
      provider: "Suppressed by the mail service",
      /** Undrawn: a reason this console does not recognise, such as one written by hand. */
      other: "Other",
    },
    sources: {
      delivery: "Delivery report",
      complaint: "Complaint report",
      deliveries: "Delivery reports",
      provider: "The mail service's own list",
      /** Undrawn. */
      other: "Recorded by hand",
    },
    at: (when: string) => `${when} IST`,
    reveal: "Reveal",
    revealLabel: (address: string) => `Reveal the address ${address}`,
    lift: "Lift",
    liftLabel: (address: string) => `Lift the suppression on ${address}`,
    liftLabelMasked: (address: string) => `Lift the suppression on ${address} (reveal the address first)`,
    liftFirst: "Reveal the address first",
    bannerOne: "1 operator address is suppressed:",
    bannerMany: (n: number) => `${n} operator addresses are suppressed:`,
    bannerRest: (addresses: string) => ` ${addresses}. A hard bounce stops all mail to an address, so their sign-in links won't arrive.`,
    notes: [
      "All stops every email to the address, sign-in and confirmation mail included. List mail stops letters and nothing else.",
      "Operator marks an address that belongs to a console member.",
      "Lift needs the address revealed first, so you can see whose mail you are restarting. It ends a suppression we recorded and asks first; it is written to the audit log.",
      "A row from the mail service's own list also has to be cleared there: lifting ours does not lift theirs.",
    ],
    phoneNotes: [
      "Open on a larger screen to lift a suppression.",
      "All stops every email to the address, sign-in and confirmation mail included. List mail stops letters and nothing else.",
      "Operator marks an address that belongs to a console member.",
    ],
    /** Undrawn: the sheet's sample always has rows. */
    none: "No addresses are suppressed.",
    /** Undrawn. */
    unavailable: "Suppressions unavailable: the database didn't answer.",
    liftDialog: {
      title: "Lift this suppression?",
      address: "Address",
      scope: "Scope",
      source: "Source",
      all: (date: string, after: string) => `Mail to this address resumes: sign-in links, confirmations and letters. It was suppressed on ${date} after ${after}, so the address may still not work. Lifting is written to the audit log.`,
      /** Undrawn: the sheet draws an All row and a mail-service row, not a List mail one. */
      list: (date: string, after: string) => `Letters to this address resume. It was suppressed on ${date} after ${after}. Lifting is written to the audit log.`,
      provider: (date: string) => `Lifting ours does not lift the mail service's own list, which suppressed this address on ${date}. Clear it there too, or mail to the address will still be refused. Lifting is written to the audit log.`,
      after: { hardBounce: "a hard bounce", complaint: "a spam complaint", delayed: "three delays in 30 days", other: "it was recorded by hand" },
      confirm: "Lift suppression",
      done: "Suppression lifted.",
    },
    errors: {
      noAccess: "Your role can't do that.",
      mismatch: "Reveal the address first: a suppression can only be lifted by someone who has seen whose it is.",
      gone: "That suppression is no longer there.",
      database: "That didn't go through: the database didn't answer. Nothing changed.",
    },
  },

  errors: {
    noAccess: "Your role can't do that.",
    invalid: "That letter can't be saved as written. Check the subject and the body.",
    gone: "That letter no longer exists.",
    notDraft: "Only a draft can be changed, and this letter has been queued.",
    notDeletable: "Only a draft can be deleted, and this letter has been queued.",
    notTested: "Send yourself a test first. Queue stays off until one has been made.",
    spent: "The availability list has had its one send, so it can't be used again.",
    nobody: "Nobody is on this list, so there is nobody to send to.",
    notOpen: "This letter isn't sending, so there is nothing to stop.",
    database: "That didn't go through: the database didn't answer. Nothing changed.",
    testFailed: "The test could not be sent, so nothing was recorded. Try again.",
    testSuppressed: "Your own address is suppressed, so a test can't reach you.",
    testUnrecorded: "The test was sent, but it could not be recorded. Send it again.",
  },
} as const;
