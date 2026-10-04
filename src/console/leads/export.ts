import { csvFile } from "@/console/csv";
import { sinceFor, type LeadFilters } from "@/console/leads/filters";

// What Delete lead and Export are bound to, and what the export's file is. Nothing here reaches the
// database or reads a header, so the browser imports it too: the dialog that mints a tap and the
// route that spends it build the same strings from this one file.
//
// EACH STRING HAS EXACTLY ONE FORM. A tap is a digest of four fields taken in the browser, and
// `console.use_tap` re-takes it in the database from the arguments it is called with. A second way
// of writing the same filters would mint one digest and spend against another, and every such act
// would fail with "no tap for this action" and nothing to say why.

/** The acts as `console_export_leads` and `console_delete_lead` name them, and as their audit rows do. */
export const LEAD_EXPORT_ACTION = "Exported leads";
export const LEAD_EXPORT_TARGET = "Leads";
export const LEAD_DELETE_ACTION = "Deleted a lead";

/** `console.lead_export_max()`. Checked here first so the member is told before a key is asked for. */
export const LEAD_EXPORT_MAX = 10_000;

/**
 * The export's filters, as the one string the tap digests: the list's five filters and the
 * deployment, keys in alphabetical order, a filter that is off as null. First seen is written as
 * the moment it counts from, taken once here, so the file is the list the member was looking at
 * and not one that drifted while they typed a reason.
 *
 * The page and the open record are not in it: an export is the whole filtered list.
 */
export function leadExportFilters(filters: LeadFilters, environment: string, now: Date): string {
  return JSON.stringify({
    account: filters.account,
    environment,
    news: filters.news,
    since: sinceFor(filters.seen, now),
    source: filters.source,
    tag: filters.tag,
  });
}

/** Delete's `value`: the deployment, so a tap minted under one approves nothing under another. */
export function leadDeleteValue(environment: string): string {
  return JSON.stringify({ environment });
}

/** "leads-2026-09-19.csv": the day the file was made, in India. */
export function leadExportFileName(now: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return `leads-${day}.csv`;
}

/** One lead as `console_export_leads` answers it: the whole address, and no note. */
export interface ExportedLead {
  readonly email: string;
  readonly news: string;
  readonly availability: boolean;
  readonly account: string;
  readonly source: string;
  readonly campaignSource: string | null;
  readonly campaignMedium: string | null;
  readonly campaignName: string | null;
  readonly tags: readonly string[];
  readonly firstSeen: string;
  readonly lastActivity: string;
}

// The header names are the data's own and are deliberately not in the messages tree, for the reason
// the audit log's export gives: the file is a record opened in a spreadsheet, not prose, and a
// translated header would make one export a different artefact in each locale.
const COLUMNS: readonly (readonly [string, (row: ExportedLead) => string | null])[] = [
  ["email", (row) => row.email],
  ["news", (row) => row.news],
  ["availability_list", (row) => String(row.availability)],
  ["account", (row) => row.account],
  ["source", (row) => row.source],
  ["campaign_source", (row) => row.campaignSource],
  ["campaign_medium", (row) => row.campaignMedium],
  ["campaign_name", (row) => row.campaignName],
  // One cell, space-separated: a tag holds no space, so the cell splits back into tags exactly.
  ["tags", (row) => row.tags.join(" ")],
  // As the database serialised them, offset and all: unambiguous wherever the file is opened.
  ["first_seen", (row) => row.firstSeen],
  ["last_activity", (row) => row.lastActivity],
];

/** The filtered list as a CSV file, in the order the database returned it. */
export function leadsCsv(rows: readonly ExportedLead[]): string {
  return csvFile(
    COLUMNS.map(([name]) => name),
    rows.map((row) => COLUMNS.map(([, read]) => read(row))),
  );
}
