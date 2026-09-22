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
      // :160, inside a visually-hidden span: the column has a header for a screen reader and none
      // on screen, because every cell in it is the same word.
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
    // :168's own `openLabel`, byte for byte -- "Open the entry: Paused PNR checks at 14:02 IST".
    // The sheet composes it from the row's action and the row's time (the table's own cell, not
    // the drawer's, so minutes and no seconds); "IST" comes from the caller for the same reason
    // the table's Time cell takes it from there (frameSignedIn.clock.ist).
    open: (action: string, time: string) => `Open the entry: ${action} at ${time}`,
  },

  // The drawer: one entry in full (AuditLog.dc.html:215-228).
  entry: {
    // :219's own title cell. The `#58213` beside it is a numeric id this database does not have --
    // console.audit_log.id is a uuid -- so the id is drawn bare rather than behind a `#` that
    // would read as "number" over something that is not one. Flagged in task-3-report.md.
    title: "Audit entry",

    // :229-238's own nine `dt` labels, in the sheet's own order, with Environment inserted second.
    labels: {
      time: "Time",
      // Not drawn: the sheet predates task-2-addendum.md §4. Second, beside the time, exactly
      // where the table puts it and for the same reason -- the drawer is the half of this module a
      // member screenshots into a ticket, and a record that will not say which deployment wrote it
      // lies by omission.
      environment: "Environment",
      member: "Member",
      action: "Action",
      target: "Target",
      reason: "Reason",
      result: "Result",
      address: "Address",
      session: "Session",
      change: "Before → after",
    },

    // :230's own Member value: "Asha Rao · Owner · key “YubiKey 5C”". The parts are joined rather
    // than templated because two of the three are genuinely absent on real rows -- the System row
    // has no role and no key at all (task-3-addendum.md §2).
    memberLine: (parts: readonly string[]) => parts.join(" · "),
    keyNamed: (name: string) => `key “${name}”`,
    // **Not drawn.** The sheet only ever draws a key that still resolves, and the database's
    // ordinary case is the other one: console.audit_log holds no foreign key, so an entry outlives
    // the key it names and `key_name` comes back null once that key is removed or reset away. The
    // entry still happened and the clause has to say so -- dropping it would claim the action was
    // taken with no key, which is a different and untrue thing.
    keyGone: "key since removed",

    // :238 composes the two jsonb columns into a sentence: "PNR checks: On → Paused. Message to
    // travellers: none → “Checks are paused…”." The **shape** is transcribed -- one clause per
    // field, `before → after`, `none` for the side a field is missing from, a full stop after each
    // -- and the sheet's prettified field names are not, because they cannot be: the columns hold
    // jsonb whose keys are whatever the writer stored (`pnr_checks`), and inventing a display name
    // per key would mean guessing. Flagged in task-3-report.md.
    changed: (field: string, before: string, after: string) => `${field}: ${before} → ${after}.`,
    // Not drawn: a before/after that is not an object of fields (jsonb also permits a scalar or an
    // array) has no field name to put in front of it, and dropping it would hide a real change.
    changedWhole: (before: string, after: string) => `${before} → ${after}.`,
    // :238's own word for the side a field is missing from.
    changeNone: "none",

    // :227, word for word. Both halves are true of the shipped database: the append-only trigger
    // refuses update and delete (20260920090300_console_audit.sql), and console.purge_audit()
    // removes rows older than two years.
    retention: "Entries can't be edited. They're deleted automatically after 2 years.",

    // Not drawn: the sheet draws the drawer open and full, and never in flight.
    loading: "Loading the entry",

    // Not drawn. console_audit_entry answers SQL NULL for an id that is not there -- no error, no
    // refusal, no database message to translate (task-3-addendum.md §3) -- and an empty panel is
    // not an answer. Kept to what is certainly true: the id is not in this log. Why it is not is
    // left to the retention line directly below it, which already says entries are deleted after
    // two years.
    missing: {
      title: "No such entry",
      detail: "Nothing in this log has that id.",
    },
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

  // Export (AuditLog.dc.html:90 for the control, :232-251 for the confirm step, :136-147 for the
  // two status rows). The confirm step is **Form TC-01** as drawn -- "Confirm it's you", a Reason
  // field, the standard hint, "Tap your key" -- so its copy is `consoleMessages.tap`'s and is not
  // restated here. What is here is only what this module draws around it.
  //
  // The sheet draws Preparing and Ready as rows on the board, between the chip row and the Entries
  // plate, and not inside the dialog: the dialog closes when the key answers.
  export: {
    // :94, beside the icon.
    action: "Export CSV",

    // :237's bold line -- "Export 14 audit entries from today" -- a function of the count and the
    // range, as the addendum says and as the sheet's own composition shows. The singular is **Not
    // drawn**: the sheet only ever draws 14, and "Export 1 audit entries" is not a sentence.
    summary: (count: number, range: string) => `Export ${count} ${count === 1 ? "audit entry" : "audit entries"} from ${range}`,

    // :139, word for word, ellipsis and full stop included. Singular Not drawn, as above.
    preparing: (count: number, range: string) => `Preparing export… ${count} ${count === 1 ? "entry" : "entries"} from ${range}.`,

    // The range, in the words the summary and the preparing line put after "from". Only `today` is
    // drawn (:237, :139); the other three are **Not drawn** and are the same vocabulary the
    // table's own caption already uses for them ("for the last 7 days", "for the chosen dates"), so
    // the two halves of this page describe a range the same way.
    ranges: {
      today: "today",
      "7d": "the last 7 days",
      "30d": "the last 30 days",
      custom: "the chosen dates",
    },

    // :145 and :146, word for word. The line is the specification, not decoration: the prepared
    // export is single-use, lives in the browser that asked for it, and is let go after ten
    // minutes.
    works: "Works once, in this browser, for 10 minutes",
    download: "Download",

    // **Not drawn.** The sheet draws the export succeeding and never failing, and a refusal that
    // showed nothing would leave a member pressing a button that had already stopped working. A
    // database refusal is a developer string and must never reach them, so each of these is the
    // console's own sentence for one thing that can really happen.

    // console.use_tap refused: the four fields it re-digests differ from the ones the tap was
    // minted over -- the filters moved under the dialog, or five minutes passed. Same shape as
    // team.invite.tapMismatch and for the same reason: it is not an outage, so it must not read
    // like one.
    tapMismatch: "That confirmation no longer matches this export. Try exporting again.",

    // console.audit_export_max(). The number comes from AUDIT_EXPORT_MAX so the line cannot claim a
    // limit the database does not hold.
    tooMany: (max: number) => `That's more than ${max.toLocaleString("en-IN")} entries. Narrow the range or the filters and try again.`,

    // Every other 42501: a role that changed in another tab, or a request that never went through
    // the filter bar. Both are answered by reloading, which is also what re-reads the role.
    refused: "The console wouldn't export that. Reload the page and try again.",
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
