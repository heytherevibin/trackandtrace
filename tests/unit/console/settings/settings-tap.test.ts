import { describe, expect, it } from "vitest";
import { jsonbText, settingsTap } from "@/console/settings/settings-tap";

// ---------------------------------------------------------------------------
// What a settings save's tap is minted over — and why it must be exactly this.
//
// console_save_settings spends the tap with
//   console.use_tap('settings.save', p_environment, p_changes::text, p_reason)
// (supabase/migrations/20260920090500_console_settings.sql:77). The dialog mints it
// before the save, in the browser. If the two disagree by one byte the save is
// refused with "no tap for this action" — which is what every live-checks save did
// from PR #81 until this: the dialog minted ("Change the live-check limit",
// "Switches & settings", "300").
//
// `p_changes::text` is Postgres's OWN rendering of the jsonb, not the JSON that was
// sent. The expected strings below were measured on the local database
// (`select '...'::jsonb::text`), not written from memory.
// ---------------------------------------------------------------------------

describe("jsonbText", () => {
  it("renders one key as Postgres does: a space after the colon", () => {
    expect(jsonbText({ live_checks_per_day: 300 })).toBe('{"live_checks_per_day": 300}');
  });

  it("orders keys shortest first, then bytewise — Postgres's jsonb order, not insertion order", () => {
    expect(jsonbText({ b: 1, a: 2, aa: 3, ab: null })).toBe('{"a": 2, "b": 1, "aa": 3, "ab": null}');
    expect(
      jsonbText({ site_notice_version: 3, site_notice_text: "Planned maintenance on 21 Sep, 02:00–03:00 IST. Checks may be slow.", site_notice_on: true }),
    ).toBe('{"site_notice_on": true, "site_notice_text": "Planned maintenance on 21 Sep, 02:00–03:00 IST. Checks may be slow.", "site_notice_version": 3}');
  });

  it("escapes a string as Postgres does, and leaves everything else raw", () => {
    expect(jsonbText({ t: 'quote " back \\ nl \n tab \t ctl \u0001 emoji 🚆 ls   end' })).toBe(
      '{"t": "quote \\" back \\\\ nl \\n tab \\t ctl \\u0001 emoji 🚆 ls   end"}',
    );
  });

  it("refuses a number that is not a whole one, where the two renderings could differ", () => {
    expect(() => jsonbText({ n: 1.5 })).toThrow();
  });
});

describe("settingsTap", () => {
  it("is the four fields console_save_settings spends, with this deployment as the target", () => {
    expect(settingsTap("production", { live_checks_per_day: 900 })).toEqual({ action: "settings.save", target: "production", value: '{"live_checks_per_day": 900}' });
  });
});
