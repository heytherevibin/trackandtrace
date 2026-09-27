import { createConsoleDb, type ConsoleDb } from "@/console/auth/db";
import { STALE_VERSION_MESSAGE } from "./settings";
import { AppError } from "@/services/errors";
import type { PostgrestError } from "@supabase/supabase-js";

// Saving a switch. One call, which checks the version, applies the change and writes one audit row
// per changed field — all in one transaction, so a failed save changes nothing, as the sheet
// promises in as many words ("Not saved: the change didn't reach the store. Nothing changed.").
//
// **The version is the whole reason this is not an UPDATE.** Two Admins with the page open are the
// ordinary case, not the exotic one: the second save would otherwise overwrite the first silently,
// and both would see their own number. `console_save_settings` refuses on a stale version, and the
// page turns that refusal into the sheet's own words rather than a generic failure — an operator
// told "it didn't reach the store" about a change that DID reach it, made by somebody else, would
// go looking for a broken database.

/**
 * `console_save_settings` raises two developer strings this side must tell apart, and the only
 * trustworthy signals are the substring the function itself raises and the SQLSTATE. A message this
 * code does not recognise is left as an unavailable store rather than guessed at.
 */
function fromSaveError(error: PostgrestError): AppError {
  const said = `${error.message}`;
  // 409 rather than a new error code: a lost version race is a conflict, and the shared `ErrorCode`
  // union is the traveller API's taxonomy too — widening it for one console page would put a code
  // on the public surface that nothing out there can ever return. The status is what the plate
  // keys on, because it is the part that means "somebody else got there first".
  if (/version/i.test(said)) return new AppError("INVALID_INPUT", STALE_VERSION_MESSAGE, { status: 409 });
  if (/nothing to save/i.test(said)) return new AppError("INVALID_INPUT", "Nothing was changed.");
  return new AppError("SOURCE_UNAVAILABLE", "The console could not reach its database.");
}

/**
 * Applies one change. `changes` is the column set exactly as `console.settings` names them, because
 * the function validates the keys against its own allow-list and a translation layer here would be
 * a second place for that list to be wrong.
 *
 * Makes no access check of its own: the route calls `requireConsoleMember("admin")` first, and
 * `console_save_settings` re-checks `console.require_role('admin')` itself regardless.
 */
export async function saveSettings(
  changes: Readonly<Record<string, number | string | boolean | null>>,
  version: number,
  reason: string,
  environment: string,
  db?: ConsoleDb,
): Promise<void> {
  const client = db ?? (await createConsoleDb());
  const { error } = await client.rpc("console_save_settings", {
    p_environment: environment,
    p_version: version,
    p_changes: changes,
    p_reason: reason,
  });
  if (error) throw fromSaveError(error);
}
