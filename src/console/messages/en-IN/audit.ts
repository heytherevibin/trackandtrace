import type { MessageTree } from "@/messages/types";

// Word for word from docs/design/sheets/console/AuditLog.dc.html (and its phone sibling), with the
// corrections recorded in task-2-report.md:
//
// - The brief's column list is `Time ↓`, `Action`, `Target`, `Reason`, `Address`, `Open`. The sheet
//   (:160) draws eight: it has `Member` between Time and Action and `Result` between Reason and
//   Address, both of which the brief omits while separately quoting their values ("Done",
//   "Refused", the role tag beside each member). Both are carried below, because the sheet is the
//   authority the addendum names.
// - `Open` is transcribed here and deliberately not drawn as a column yet: Task 3 owns the drawer
//   it opens and the accessible name of the control (the plan's own pre-flight note says so), and a
//   visually-hidden header over a column of empty cells is worse than no column -- the same call
//   task-3-report.md made for the Team page's own Actions column, which Task 7 then filled.
// - `Environment` is new and **Not drawn**: the sheet predates the ruling that every row must show
//   which deployment wrote it (task-2-addendum.md §4, and the migration
//   20260922140100_console_audit_environment.sql that carries it). Its picker and its chip are new
//   for the same reason.
// - The sheet's "Sample data" cells and its "Updated 14:32 IST · Sample data" page meta are the
//   design tool's own placeholders, not copy -- the same reading src/console/account/keys-plate.tsx
//   and src/console/messages/en-IN/team.ts already took of them.
// - "Export CSV" (:94), the export dialog (:236) and the phone sheet's "Open on a larger screen to
//   export." belong to Tasks 4 and 5 and are left to them.

// The five words the plate's own header cell joins: "Today · 14" (AuditLog.dc.html:353's rangeCell).
const rangeCell = (range: string, total: number) => `${range} · ${total}`;

export const audit = {
  // AuditLog.dc.html:5's own <title>, the browser tab rather than the page heading -- the same slot
  // ConsoleMyKeys.dc.html's title fills (my-keys.ts) and the same mistake team.ts records fixing.
  pageTitle: "Console audit log",
  kicker: "14 · Audit log",
  title: "Audit log",
  lead: "Every action taken in the console: who took it, when and why.",

  filters: {
    // AuditLog.dc.html:111's own role="search" landmark name.
    regionLabel: "Filter the audit log",
    // :114 -- the sheet gives the box the same words as its label and its placeholder.
    search: "Search reasons and targets",
    member: "Member",
    category: "Category",
    result: "Result",
    // Not drawn. The environment filter is task-2-addendum.md §4's, not the sheet's.
    environment: "Environment",
    // :116's own value for an unfiltered picker.
    all: "All",
    // :120's own group name.
    rangeLabel: "Date range",
    ranges: {
      today: "Today",
      "7d": "7 days",
      "30d": "30 days",
      custom: "Custom",
    },
    // Not drawn: the sheet offers `Custom` and draws no fields behind it. Two day boxes are the
    // smallest honest thing that word can mean.
    customFrom: "From",
    customTo: "To",
    // :130 and :132.
    active: "Filters",
    clear: "Clear filters",
    // :131's own chip and its own remove label, byte for byte ("Category: Messages" / "Remove the
    // filter Category: Messages").
    chip: (name: string, value: string) => `${name}: ${value}`,
    remove: (chip: string) => `Remove the filter ${chip}`,
  },

  entries: {
    title: "Entries",
    // :158's visually-hidden caption, exactly as drawn for Today. The sheet only ever draws the
    // Today range, so the other three are **Not drawn** -- authored here rather than left saying
    // "for today" over thirty days of rows, which is the one thing an accessible name must not do.
    caption: {
      today: "Audit entries for today, newest first",
      "7d": "Audit entries for the last 7 days, newest first",
      "30d": "Audit entries for the last 30 days, newest first",
      custom: "Audit entries for the chosen dates, newest first",
    },
    // :160. Plain strings, every one: DataTable prints each header into `data-label` for the
    // stacked phone layout, where a ReactNode becomes "[object Object]"
    // (src/components/ui/data-table.tsx's own note, and task-2-addendum.md §6).
    columns: {
      time: "Time ↓",
      member: "Member",
      action: "Action",
      target: "Target",
      reason: "Reason",
      result: "Result",
      address: "Address",
      // Not drawn -- see the note at the top of this file.
      environment: "Environment",
      // Drawn (:160, inside a visually-hidden span) and not used yet: Task 3 owns the drawer.
      open: "Open",
    },
    rangeCell,
    // :322's own em dash for a row with no reason and no address.
    none: "—",
    // :322 again: the sheet puts a reason in curly quotes and leaves everything else bare.
    quoted: (reason: string) => `“${reason}”`,
    // :185's own accessible name for the skeleton.
    loading: "Loading audit entries",
    // :178 -- "1–14 of 14", with the sheet's en dash.
    pageRange: (first: number, last: number, total: number) => `${first}–${last} of ${total}`,
    previous: "Previous",
    next: "Next",
  },

  // :323's own two words for console.audit_result, plus the third label the enum carries.
  results: {
    done: "Done",
    refused: "Refused",
    failed: "Failed",
  },

  // Only `Messages` is drawn (:131, as the chip's value). The rest are **Not drawn**: the column is
  // free text with a length check, so these are labels for the values this console actually writes
  // (src/console/auth/audit.ts) plus the `system` rows console.purge_audit and its kin leave behind.
  // A category outside this list is shown as the database stored it rather than hidden.
  categories: {
    session: "Session",
    team: "Team",
    configure: "Configure",
    messages: "Messages",
    provider_keys: "Provider keys",
    leads: "Leads",
    record: "Record",
    system: "System",
  },

  empty: {
    title: "No actions in this range",
    detail: "Nothing was done in the console with these filters.",
    action: "Clear filters",
  },

  error: {
    title: "The audit log didn't load",
    detail: "The console couldn't reach its database.",
    action: "Retry",
  },
} as const satisfies MessageTree;
