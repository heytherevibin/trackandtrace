import { describe, expect, it } from "vitest";
import { readLimits, type SettingsRow } from "@/console/settings/settings";

// ---------------------------------------------------------------------------
// What the Limits plate is given to draw.
//
// The sheet draws a number, a meter and who last changed it. Two of those three
// can be absent for ordinary reasons, and the plate must be able to tell which:
//
//   * a NULL column means the console has not taken the switch over, so the
//     deployment's own number is still in force. It is not zero and not "off".
//   * a meter that cannot be read is not a meter reading zero. "0 used today" is
//     a claim; an unread counter is an absence, and drawing the first for the
//     second would tell an operator the site is idle when it may be busy.
// ---------------------------------------------------------------------------

function row(over: Partial<SettingsRow> = {}): SettingsRow {
  return { live_checks_per_day: 900, version: 4, changed_at: "2026-09-27T10:30:00.000Z", changed_by_name: "Asha Rao", ...over };
}

describe("readLimits", () => {
  it("reports the console's number, and that it is the console's", () => {
    const limits = readLimits(row(), { used: 157, fallback: 300 });

    expect(limits.liveChecks).toEqual({ value: 900, fromConsole: true });
    expect(limits.used).toBe(157);
    expect(limits.version).toBe(4);
  });

  it("reports the deployment's number when the column is null, and says it came from there", () => {
    const limits = readLimits(row({ live_checks_per_day: null }), { used: 12, fallback: 300 });

    expect(limits.liveChecks).toEqual({ value: 300, fromConsole: false });
  });

  it("keeps an unreadable meter distinct from a meter reading zero", () => {
    expect(readLimits(row(), { used: null, fallback: 300 }).used).toBeNull();
    expect(readLimits(row(), { used: 0, fallback: 300 }).used).toBe(0);
  });

  it("carries who last changed it, and admits when nobody has", () => {
    expect(readLimits(row(), { used: 0, fallback: 300 }).changedBy).toBe("Asha Rao");
    expect(readLimits(row({ changed_by_name: null }), { used: 0, fallback: 300 }).changedBy).toBeNull();
  });

  it("refuses a stored number outside the column's own range rather than drawing it", () => {
    // The check constraint is 1..1,000,000. A value outside it was not written by
    // this console, and drawing it would make the page a witness for something
    // that cannot be in force — `runtime-settings` refuses it on the read path too.
    for (const bad of [0, -1, 2_000_000]) {
      expect(readLimits(row({ live_checks_per_day: bad }), { used: 0, fallback: 300 }).liveChecks, String(bad)).toEqual({
        value: 300,
        fromConsole: false,
      });
    }
  });

  it("survives a settings row that is missing entirely, because a console with no row still has a page", () => {
    const limits = readLimits(null, { used: 5, fallback: 300 });

    expect(limits.liveChecks).toEqual({ value: 300, fromConsole: false });
    expect(limits.version).toBeNull();
    expect(limits.changedBy).toBeNull();
  });
});
