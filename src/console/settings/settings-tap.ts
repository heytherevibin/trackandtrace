// The four fields a settings save's tap is minted over — the same four `console_save_settings` spends:
//
//   console.use_tap('settings.save', p_environment, p_changes::text, p_reason)
//   (supabase/migrations/20260920090500_console_settings.sql:77)
//
// The dialog mints in the browser, the database spends; one byte apart and the save is refused with
// "no tap for this action". Every live-checks save was, from PR #81 until this file: the dialog
// minted ("Change the live-check limit", "Switches & settings", "300").
//
// Pure, with no imports, so a "use client" plate can use it.

export type SettingValue = string | number | boolean | null;

const SETTINGS_ACTION = "settings.save";

/** Postgres's jsonb key order: shorter keys first, then bytewise. Not insertion order. */
function jsonbOrder(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

function scalar(value: SettingValue): string {
  if (typeof value === "number") {
    // A fraction or an exponent is where the two renderings part ("1.50" stays "1.50" in Postgres).
    // Every setting is a whole number, so anything else is refused rather than guessed at.
    if (!Number.isSafeInteger(value)) throw new Error("jsonbText renders whole numbers only");
    return String(value);
  }
  // A string's escaping is the same in both (measured): \" \\ \n \t \b \f \r, other controls as
  // \u00XX, and everything else — "–", an emoji, U+2028 — left raw.
  return JSON.stringify(value);
}

/**
 * An object of settings as `jsonb::text` prints it: `{"a": 1, "bb": true}` — a space after each
 * colon and comma, keys in jsonb's order. Measured against the database, not recalled.
 */
export function jsonbText(changes: Readonly<Record<string, SettingValue>>): string {
  const keys = Object.keys(changes).sort(jsonbOrder);
  return `{${keys.map((k) => `${JSON.stringify(k)}: ${scalar(changes[k] ?? null)}`).join(", ")}}`;
}

/** The action, target and value for a save of `changes` on `environment` (the reason is the dialog's). */
export function settingsTap(environment: string, changes: Readonly<Record<string, SettingValue>>): { readonly action: string; readonly target: string; readonly value: string } {
  return { action: SETTINGS_ACTION, target: environment, value: jsonbText(changes) };
}
