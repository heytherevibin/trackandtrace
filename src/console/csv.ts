// The one CSV writer the console's exports share (the audit log's, and Leads'). Lifted out of
// src/console/audit/audit.ts unchanged when a second export needed it.

/**
 * The characters a spreadsheet reads as the start of a formula rather than as text.
 *
 * An export is opened in Excel or Sheets by the person doing a review, and it holds text people
 * typed: a reason, a target, an email address. A cell beginning `=`, `+`, `-` or `@` is evaluated
 * on open; a leading tab or carriage return can smuggle one past a naive check. Quoting is not a
 * defence here: a spreadsheet strips the quotes and evaluates what is inside.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * One field, RFC 4180: quoted when it carries a quote, a comma or a line break, with the quotes
 * inside it doubled.
 *
 * A field that would be read as a formula gets a leading apostrophe first. That is a real
 * alteration of the record and it is the deliberate trade: the apostrophe is visible in the file,
 * and a record that is slightly annotated is better than one that runs. Only the leading character
 * is touched; nothing else in the value is changed.
 */
export function csvField(value: string | null): string {
  if (value === null || value === "") return "";
  const guarded = FORMULA_LEAD.test(value) ? `'${value}` : value;
  return /["\r\n,]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

/**
 * A whole file: the header, then one line per row, in the order given.
 *
 * CRLF line endings and a leading byte-order mark, both for the program that will actually open
 * this: without the BOM, Excel reads UTF-8 as the local code page, and curly quotes, ellipses and
 * Indian names arrive as mojibake in a document someone is about to sign off on.
 */
export function csvFile(header: readonly string[], rows: readonly (readonly (string | null)[])[]): string {
  return `﻿${[header.join(","), ...rows.map((row) => row.map(csvField).join(","))].join("\r\n")}`;
}
