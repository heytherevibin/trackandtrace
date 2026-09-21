import { z } from "zod";
import { createConsoleDb, type ConsoleDb } from "@/console/auth/db";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

export interface MySessionRow {
  readonly id: string;
  readonly deviceLabel: string;
  readonly lastSeenAt: string;
  readonly createdAt: string;
  readonly isCurrent: boolean;
}

// Parsed, not cast (the same rule my-keys.ts follows, task-6-addendum.md §4): a field drifting on
// console_my_sessions must fail closed here rather than hand the page a shape it treats as real.
// device_label is capped at 120 -- console.sessions' own column limit, which deviceLabel()
// (@/console/auth/session) already enforces when a row is written.
const sessionShape = z.object({
  session_id: z.guid(),
  device_label: z.string().min(1).max(120),
  last_seen_at: z.string(),
  created_at: z.string(),
  is_current: z.boolean(),
});

// console_my_sessions() returns a bare jsonb array (coalesce(jsonb_agg(...), '[]'::jsonb)) --
// unlike console_my_keys, which wraps its rows in {keys, member}. A wrapped-object response here
// is exactly as wrong as a missing field, so it is refused the same way, not defaulted to [].
const mySessionsShape = z.array(sessionShape);

function unavailable(): AppError {
  return new AppError("SOURCE_UNAVAILABLE", consoleMessages.session.unavailable, { status: 503 });
}

/**
 * A thin typed wrapper over `console_my_sessions` (task-9): every session that is not revoked and
 * not expired, including one that never completed key verification -- a deliberate choice
 * (task-9-addendum.md §3), not a filter this function should add.
 */
export async function getMySessions(db?: ConsoleDb): Promise<readonly MySessionRow[]> {
  const client = db ?? (await createConsoleDb());
  const { data, error } = await client.rpc("console_my_sessions");
  if (error) throw unavailable();
  const parsed = mySessionsShape.safeParse(data);
  if (!parsed.success) throw unavailable();
  return parsed.data.map((s) => ({ id: s.session_id, deviceLabel: s.device_label, lastSeenAt: s.last_seen_at, createdAt: s.created_at, isCurrent: s.is_current }));
}

/**
 * A thin wrapper over `console_sign_out_others` (task-9): one argument -- p_environment, the
 * caller's own `consoleEnvironment()` (`@/console/auth/session`), the same way every other
 * audit-writing function in this console takes it. No tap: this only ever reduces the caller's own
 * access (the sheet's own comment on the function, supabase/migrations/20260921100000_console_my_keys.sql),
 * so the drawn screen confirms it with a dialog rather than a key. The function raises nothing of
 * its own beyond a generic database fault, so every error maps to the shared unavailable line --
 * there is no bespoke refusal text to tell apart, unlike console_remove_key's two-key floor.
 */
export async function signOutOtherSessions(environment: string, db?: ConsoleDb): Promise<number> {
  const client = db ?? (await createConsoleDb());
  const { data, error } = await client.rpc("console_sign_out_others", { p_environment: environment });
  if (error) throw unavailable();
  const parsed = z.number().int().nonnegative().safeParse(data);
  if (!parsed.success) throw unavailable();
  return parsed.data;
}
