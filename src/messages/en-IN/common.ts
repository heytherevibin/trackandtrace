import type { MessageTree } from "../types";

export const common = {
  productName: "Trakline",
  descriptor: "PNR status, checked live",
  notAffiliated: "Not affiliated with IRCTC or Indian Railways.",
  footerDisclaimer: "An independent service, not affiliated with IRCTC or Indian Railways. Every result shows only what the reservation service returned, with the time it was retrieved.",
  ist: "IST",
  retry: "Retry",
  cancel: "Cancel",
  close: "Close",
  back: "Back",
  loading: "Loading",
  notReturned: "Not returned",
  sampleData: "Sample data",
  sampleDataHint: "Development fixture. Not a real reservation.",
  copy: "Copy",
  copied: "Copied",
  share: "Share",
  clear: "Clear",
  run: "Run",
  undo: "Undo",
  dismiss: "Dismiss",
  skipToContent: "Skip to content",
  /**
   * The date field's own calendar, drawn here rather than by the browser.
   *
   * Chrome's popup is not in the document and takes no styling: it renders at its own size, in its
   * own greys, with tap targets no phone standard would pass, and differently again on Firefox and
   * on Windows. It was the last control on the page the design system did not own.
   */
  calendar: {
    open: "Choose a date",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    /**
     * Sunday first, as Indian Railways prints a timetable.
     *
     * Seven keys rather than a list because `MessageTree` holds no array of plain strings — and
     * named days survive a translator reordering them, which a positional list would not.
     */
    weekdays: { sun: "Su", mon: "Mo", tue: "Tu", wed: "We", thu: "Th", fri: "Fr", sat: "Sa" },
    /** Screen-reader only: a cell says its full date, never just "14". */
    dayLabel: (full: string) => full,
    today: "Today",
    unavailable: "Not available",
  },
} as const satisfies MessageTree;
