/**
 * Module 11, Switches & settings (Console Switches.dc.html). Transcribed from the sheet.
 *
 * **One plate of the three, and the other two are not "later" in the vague sense.** The sheet draws
 * PLATE "Switches" over six controls and PLATE "Limits" over two. Of those eight, exactly one has
 * anything behind it: `live_checks_per_day`, wired on 2026-09-27. The rest are columns in
 * `console.settings` that nothing reads — the rate limits are module constants, the source registry
 * reads the environment, and the traveller side of the notice has not been built.
 *
 * A control that writes an audit row and changes nothing is worse than no control: it tells an
 * operator the site is doing something it is not. That failure had just been found and fixed
 * elsewhere the same day — the column this page finally reads had sat unread since PR #23 — so
 * drawing seven more of them would have been repeating it knowingly. Each row arrives with its
 * wiring.
 */
export const settings = {
  pageTitle: "Switches & settings · Trakline console",
  kicker: "11 · Switches & settings",
  title: "Switches & settings",
  lead: "What travellers get, changed here and recorded in the audit log.",

  limits: {
    legend: "Limits",
    liveChecks: {
      /** The sheet: "Live checks per day: 300, across all addresses." */
      name: "Live checks per day",
      across: "across all addresses",
      /** The sheet's meter. */
      used: (used: number) => `${used} used today`,
      legend: "Past this, checks answer from recent results, or say the service is busy until 00:00 IST.",
      /** Null in the store means the deployment's own number is still in force. */
      fromDeployment: (value: number) => `${value}, from the deployment`,
      field: "Live checks per day",
      hint: "Between 1 and 1,000,000.",
      save: "Save",
      outOfRange: "That is not a number this field takes: between 1 and 1,000,000.",
      unchanged: "That is already the number in force.",
    },
    /** Drawn, and deliberately not editable yet. See the note at the head of this file. */
    notWiredYet: "Not connected yet — this deployment still reads its own setting.",
  },

  /** PLATE "Switches". One row of the six is wired: the site notice. Each other row arrives with its wiring. */
  switches: {
    title: "Switches",
    on: "On",
    off: "Off",
    save: "Save",
    phoneOnly: "Open on a larger screen to edit.",
    notice: {
      name: "Site notice",
      effect: "A strip under the masthead on every page, until the traveller closes it.",
      textLabel: "Notice text",
      hint: "Up to 160 characters.",
      previewLabel: "Preview",
      preview: (text: string) => `Preview of the strip travellers see: ${text}`,
      empty: "A notice needs its text before it can be turned on.",
      unchanged: "Nothing has changed.",
      summary: "This changes what every traveller sees under the masthead, on every page, immediately.",
      textChange: "Notice text",
    },
  },

  lastChanged: (when: string, who: string) => `Last changed ${when} by ${who}`,
  neverChanged: "Never changed from this console",

  /** The sheet's PROPS, in its own words where it gives them. */
  state: {
    saving: "Saving…",
    saved: (what: string) => `${what} · logged`,
    failed: "Not saved: the change didn't reach the store. Nothing changed.",
    /** The sheet: a version check exists so two saves cannot clash. This is what losing that race says. */
    stale: "Not saved: someone else changed this while you were looking. Nothing changed — open it again to see where it stands.",
  },

  /** Confirm it's you, which every change on this page goes through. */
  tap: {
    summary: "This changes how many live checks travellers get in a day, for everyone, immediately.",
    changeLabel: "Live checks per day",
  },
} as const;
