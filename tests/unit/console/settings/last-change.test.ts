import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuditLog } = vi.hoisted(() => ({ getAuditLog: vi.fn() }));
vi.mock("@/console/audit/audit", () => ({ getAuditLog }));

import { lastSettingChange } from "@/console/settings/last-change";

// "Every row shows who changed it last, and when" (Console Switches.dc.html, CHECKS).
//
// Not from the settings row: `changed_at` is when ANY switch last moved, and there is no name on the
// row at all (`changed_by` is an id, and `changed_by_name` — which the Limits plate read — was never
// a column). So "Last changed" on Live checks said "Never changed from this console" after every
// change. Each row now reads its own last Done audit row, by the setting's own column name.

beforeEach(() => {
  getAuditLog.mockReset();
});

describe("lastSettingChange", () => {
  it("is the newest Done settings row naming that column, for this deployment", async () => {
    getAuditLog.mockResolvedValue({ rows: [{ at: "2026-09-28T10:15:00+05:30", actorName: "Rohan Iyer" }], total: 3 });
    expect(await lastSettingChange("site_notice", "production")).toEqual({ at: "2026-09-28T10:15:00+05:30", by: "Rohan Iyer" });
    expect(getAuditLog).toHaveBeenCalledWith({ from: null, to: null, member: null, category: "settings", result: "done", search: "site_notice", environment: "production", limit: 1, offset: 0 });
  });

  it("is null when that setting has never been changed from the console", async () => {
    getAuditLog.mockResolvedValue({ rows: [], total: 0 });
    expect(await lastSettingChange("live_checks_per_day", "production")).toBeNull();
  });

  it("is null, not a throw, when the log cannot be read — one line must not take the page down", async () => {
    getAuditLog.mockImplementation(async () => {
      throw new Error("down");
    });
    expect(await lastSettingChange("live_checks_per_day", "production")).toBeNull();
  });
});
