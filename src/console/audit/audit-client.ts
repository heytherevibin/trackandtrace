"use client";

import { z } from "zod";
import { AUDIT_ENVIRONMENT_MAX, AUDIT_RESULTS, auditFiltersToSearch, type AuditFilters } from "@/console/audit/filters";
import { apiRequest, type ApiResult } from "@/services/api-client";

// The browser half of module 14: re-read a page, and prepare an export.
//
// It exists as a file of its own because `audit.ts` reaches the database through
// `@/console/auth/db`, which reads next/headers, so it cannot be pulled into a browser bundle --
// the same split src/console/account/my-keys-client.ts draws against my-keys.ts. Both response
// shapes are therefore restated here rather than imported, and both are re-validated: a body that
// is not what the route promised is an error, never data.
//
// Tasks 2 and 3 deliberately left this file uncreated and kept the read inline in
// `entries-plate.tsx`, so that an empty file would not be one two tasks fought over; the read moves
// here now that there is a second caller to share it with.

/** One row as GET /api/audit serialises it. Only what the table and the drawer actually render. */
const rowShape = z.object({
  id: z.guid(),
  // An offset, never a "Z", and no fractional part at zero microseconds -- the shape the database
  // really produces (task-2-addendum.md §2).
  at: z.iso.datetime({ offset: true }),
  // The column's own constraint, imported rather than the third place "20" is written down or
  // forgotten -- `audit.ts`'s server-side twin held it and this one did not.
  environment: z.string().min(1).max(AUDIT_ENVIRONMENT_MAX),
  actorId: z.guid().nullable(),
  actorName: z.string().min(1),
  actorRole: z.enum(["owner", "admin", "support", "viewer"]).nullable(),
  keyId: z.guid().nullable(),
  sessionLabel: z.string().nullable(),
  category: z.string().min(1),
  action: z.string().min(1),
  target: z.string().nullable(),
  reason: z.string().nullable(),
  result: z.enum(AUDIT_RESULTS),
  addressHash: z.string().nullable(),
  before: z.json(),
  after: z.json(),
});

const pageShape = z.object({ ok: z.literal(true), total: z.number().int().nonnegative(), rows: z.array(rowShape) });

export type AuditPageRow = z.infer<typeof rowShape>;
export interface AuditPageAnswer {
  readonly rows: readonly AuditPageRow[];
  readonly total: number;
}

/** One page of the log, filtered. Writes no audit row -- the page's own server render does that. */
export async function readAuditPage(filters: AuditFilters, environment: string): Promise<ApiResult<AuditPageAnswer>> {
  return apiRequest(`/api/audit${auditFiltersToSearch(filters, environment)}`, { method: "GET" }, pageShape);
}

const exportShape = z.object({
  ok: z.literal(true),
  csv: z.string(),
  count: z.number().int().nonnegative(),
  // Enough of a shape to keep a drifted body from becoming a file name on the board and, worse, a
  // download attribute: it is the drawn `audit-2026-09-19.csv` and its two longer siblings.
  fileName: z.string().regex(/^audit(-[\w-]+)?\.csv$/),
});

export type PreparedAuditExport = Omit<z.infer<typeof exportShape>, "ok">;

/**
 * One export, prepared.
 *
 * **The answer is the whole export.** The CSV comes back in this response body and is never written
 * anywhere on the server -- no token, no store, no download URL. That is what makes the sheet's own
 * line ("Works once, in this browser, for 10 minutes") true by construction: there is nothing for a
 * second request to fetch, so there is no link to leak and nothing for anyone else to replay.
 *
 * `range` and `filters` go out exactly as the caller built them, which is exactly what the tap was
 * minted over. Reshaping either here would mint one digest and spend against another, and the
 * member would be told their confirmation no longer matches something they had just confirmed.
 *
 * A longer deadline than apiRequest's own eight seconds: this call reads up to AUDIT_EXPORT_MAX
 * rows, writes an audit row and serialises a file, all in one round trip, and a timeout after the
 * transaction committed would leave a member with no file and a permanent record saying otherwise.
 */
export async function prepareAuditExport(ask: {
  readonly range: string;
  readonly filters: string;
  readonly reason: string;
}): Promise<ApiResult<PreparedAuditExport>> {
  return apiRequest(
    "/api/audit/export",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ask) },
    exportShape,
    { timeoutMs: 30_000 },
  );
}
