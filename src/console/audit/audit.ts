import { z } from "zod";
import { AUDIT_RESULTS, type AuditQuery, type AuditResult } from "@/console/audit/filters";
import { createConsoleDb, type ConsoleDb } from "@/console/auth/db";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

export type { AuditQuery, AuditResult };

/** One row of `console.audit_log`, as `console.audit_row` serialises it -- all sixteen keys, camelCased. */
export interface AuditEntry {
  readonly id: string;
  /** A timestamptz with an offset, never a "Z", and with no fractional part at zero microseconds. */
  readonly at: string;
  /** Which deployment wrote the row. Shown on every row, non-negotiably (task-2-addendum.md §4). */
  readonly environment: string;
  readonly actorId: string | null;
  readonly actorName: string;
  readonly actorRole: ConsoleRole | null;
  readonly keyId: string | null;
  readonly sessionLabel: string | null;
  readonly category: string;
  readonly action: string;
  readonly target: string | null;
  readonly reason: string | null;
  readonly result: AuditResult;
  readonly addressHash: string | null;
  readonly before: unknown;
  readonly after: unknown;
}

/**
 * One entry as `console_audit_entry` serialises it: a list row's sixteen keys plus the key's name,
 * resolved through a LEFT join on `console.keys` that lives on that function alone
 * (task-3-addendum.md §2).
 */
export interface AuditEntryDetail extends AuditEntry {
  /**
   * The name of the key `keyId` points at, **today** -- or null when it points at nothing.
   *
   * Null is not an edge case. `console.audit_log` holds no foreign key on purpose: the record
   * outlives the key and must never be rewritten when one is removed or reset away, so an old
   * entry whose key is gone is the ordinary case. `keyId` null and `keyName` null mean different
   * things -- no key was used, against a key that is no longer there -- and the drawer says each
   * of them differently.
   */
  readonly keyName: string | null;
}

export interface AuditPage {
  readonly rows: readonly AuditEntry[];
  /** The **filtered** set, not the page: a filter that narrows 200 rows to 3 returns 3, whatever the limit was. */
  readonly total: number;
}

/**
 * The real contract, taken from the database rather than inferred: `npm run db:types` generates
 * `Args` all-optional and `Returns: Json` for `console_audit`, which tells a caller almost nothing
 * (task-2-addendum.md §1). Every shape below has cost this project a production bug once:
 *
 * - **`at` carries an offset, never `Z`**, and drops its fractional part entirely at zero
 *   microseconds -- `2019-03-14T14:02:31.256374+00:00` beside `2019-03-14T02:00:00+00:00`.
 *   `z.iso.datetime({ offset: true })` covers both; the "Z" form is what shipped the watchlist bug.
 * - **A null column is present and null**, never a missing key: `jsonb_build_object` keeps the key
 *   and nothing in this path calls `jsonb_strip_nulls`. So `.nullable()`, never `.optional()`.
 * - **`category` is `z.string()`, not an enum.** The column is free text with a 1..40 length check,
 *   and the System row's `'system'` is outside the six names in src/console/auth/audit.ts:12. An
 *   enum here would fail closed on a real row.
 * - **`environment` is a non-null string** -- `VERCEL_ENV ?? NODE_ENV`, not a closed set.
 * - **`result` is the one genuinely closed set**, and the database compares it as text and never
 *   casts it (a cast would raise a raw 22P02 at a member), so this is where it is enforced.
 * - `before` and `after` are jsonb of any shape. `z.json()` keeps the key required while accepting
 *   whatever is in it, which `z.unknown()` would not -- that makes the key optional.
 */
const rowShape = z.object({
  id: z.guid(),
  at: z.iso.datetime({ offset: true }),
  environment: z.string().min(1).max(20),
  actor_id: z.guid().nullable(),
  actor_name: z.string().min(1).max(120),
  actor_role: z.enum(["owner", "admin", "support", "viewer"]).nullable(),
  key_id: z.guid().nullable(),
  session_label: z.string().nullable(),
  category: z.string().min(1).max(40),
  action: z.string().min(1).max(120),
  target: z.string().nullable(),
  reason: z.string().nullable(),
  result: z.enum(AUDIT_RESULTS),
  address_hash: z.string().nullable(),
  before: z.json(),
  after: z.json(),
});

// An empty page is a real `[]`, pinned by Task 1's own assertion and by the `coalesce(..., '[]')`
// in 20260922140100_console_audit_environment.sql, so z.array() is safe here.
const pageShape = z.object({ rows: z.array(rowShape), total: z.number().int().nonnegative() });

// `.nullable()` and not `.optional()`, for the same reason every other nullable column here is:
// the `||` in 20260922190000_console_audit_entry_key_name.sql merges a jsonb_build_object that
// keeps the key whatever k.name is, so a *missing* key_name is drift -- an older
// console_audit_entry that never learned to join -- and not a key that has gone. 1..60 is
// console.keys.name's own check constraint.
const entryShape = rowShape.extend({ key_name: z.string().min(1).max(60).nullable() });

function toEntry(row: z.infer<typeof rowShape>): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    environment: row.environment,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    keyId: row.key_id,
    sessionLabel: row.session_label,
    category: row.category,
    action: row.action,
    target: row.target,
    reason: row.reason,
    result: row.result,
    addressHash: row.address_hash,
    before: row.before,
    after: row.after,
  };
}

function unavailable(): AppError {
  return new AppError("SOURCE_UNAVAILABLE", consoleMessages.session.unavailable, { status: 503 });
}

/**
 * Parsed, never cast, the same precedent src/console/team/team.ts sets: a field that drifted on
 * `console_audit` must read as "couldn't load" rather than hand the table a shape it treats as
 * real. Exported on its own so the shape can be held by a test without a database in front of it.
 */
export function parseAuditPage(data: unknown): AuditPage {
  const parsed = pageShape.safeParse(data);
  if (!parsed.success) throw unavailable();
  return { total: parsed.data.total, rows: parsed.data.rows.map(toEntry) };
}

/**
 * One entry, or `null` for an id that is not there.
 *
 * **`null` is data, not drift.** `console_audit_entry` answers SQL NULL for an unknown id -- not an
 * error, not a refusal, and with no database message for anyone to translate (task-3-addendum.md
 * §3). It is separated from a shape that failed to parse here, at the only point where the two are
 * still distinguishable, so the drawer can say "no such entry" without also swallowing drift.
 */
export function parseAuditEntry(data: unknown): AuditEntryDetail | null {
  if (data === null) return null;
  const parsed = entryShape.safeParse(data);
  if (!parsed.success) throw unavailable();
  return { ...toEntry(parsed.data), keyName: parsed.data.key_name };
}

/**
 * `console_audit` raises one thing a member could act on differently and nothing else: every console
 * refusal is a 42501, and by the time one gets here it means the reader may not open this module --
 * a role changed in another tab, or a hand-made request below the floor. That gets the console's own
 * no-access line, in the words every other module already uses. Anything else is a driver string, a
 * missing relation, a provider's wording -- none of it written for a member to read.
 */
function fromAuditError(error: { readonly message: string; readonly code?: string }): AppError {
  if (error.code === "42501") return new AppError("INVALID_INPUT", consoleMessages.session.noAccess, { status: 403 });
  return unavailable();
}

/**
 * A thin typed wrapper over `console_audit` (Task 1): one page of the log and the size of the set it
 * was cut from, in the one round trip the function already makes.
 *
 * Every filter goes as `undefined` when it is absent, which `JSON.stringify` drops from the request
 * body, so the parameter falls to its own `default null` inside the function. That is deliberate and
 * it is not a formatting choice: `p_category`, `p_result` and `p_environment` are plain equalities,
 * so an empty string means *match nothing* and would show a member an empty log with nothing to
 * explain it (task-2-addendum.md §3). Sending nothing is the only way to say "no filter".
 *
 * Makes no access check of its own. The page and its GET route guard first, and `console_audit`
 * re-checks `console.require_role('admin')` itself regardless -- a floor, so an Owner and an Admin
 * both pass and Support and Viewer are refused.
 */
export async function getAuditLog(query: AuditQuery, db?: ConsoleDb): Promise<AuditPage> {
  const client = db ?? (await createConsoleDb());
  const { data, error } = await client.rpc("console_audit", {
    p_from: query.from ?? undefined,
    p_to: query.to ?? undefined,
    p_member: query.member ?? undefined,
    p_category: query.category ?? undefined,
    p_result: query.result ?? undefined,
    p_search: query.search ?? undefined,
    p_environment: query.environment ?? undefined,
    p_limit: query.limit,
    p_offset: query.offset,
  });
  if (error) throw fromAuditError(error);
  return parseAuditPage(data);
}

/**
 * One entry for the drawer (Task 3), from `console_audit_entry`.
 *
 * Makes no access check of its own, exactly as `getAuditLog` makes none: the route above guards,
 * and the function re-checks `console.require_role('admin')` itself -- a floor, so Owner and Admin
 * both pass. It is deliberately **not** scoped by environment either: an entry another deployment
 * wrote opens normally and the drawer shows its `environment` like any other field. Scoping would
 * answer null on a shared link and give a member an empty drawer with nothing to explain it
 * (task-3-addendum.md §3).
 *
 * `id` must already be a uuid. The route narrows it, because `p_id` is uuid-typed and PostgREST
 * raises a raw 22P02 "invalid input syntax for type uuid" on anything else -- a developer string
 * that would reach a member unchanged.
 */
export async function getAuditEntry(id: string, db?: ConsoleDb): Promise<AuditEntryDetail | null> {
  const client = db ?? (await createConsoleDb());
  const { data, error } = await client.rpc("console_audit_entry", { p_id: id });
  if (error) throw fromAuditError(error);
  return parseAuditEntry(data);
}
