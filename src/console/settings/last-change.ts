import { getAuditLog } from "@/console/audit/audit";

/**
 * Who last changed one setting, and when: the newest Done `settings` audit row whose target names
 * the column (console_save_settings writes one row per changed field, with the column as target).
 *
 * Not from the settings row — its `changed_at` is when ANY switch last moved, and it carries no name.
 * Null when the setting has never been changed from the console, and null when the log cannot be read:
 * one "Last changed" line must never take the page down with it.
 */
export async function lastSettingChange(column: string, environment: string): Promise<{ readonly at: string; readonly by: string } | null> {
  try {
    const page = await getAuditLog({ from: null, to: null, member: null, category: "settings", result: "done", search: column, environment, limit: 1, offset: 0 });
    const row = page.rows[0];
    return row ? { at: row.at, by: row.actorName } : null;
  } catch {
    return null;
  }
}
