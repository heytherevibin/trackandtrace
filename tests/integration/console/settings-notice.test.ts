import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";
import { AppError } from "@/services/errors";

const { requireConsoleMember, saveSettings } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  saveSettings: vi.fn<(changes: unknown, version: number, reason: string, environment: string) => Promise<void>>(async () => {}),
}));
vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment: () => "production" }));
vi.mock("@/console/availability", () => ({ assertConsoleAvailable: () => {} }));
vi.mock("@/console/settings/save", () => ({ saveSettings }));

import { POST } from "@/app/console/api/settings/notice/route";

// POST /api/settings/notice: the Site notice row's save. The changes are built by the same
// `noticeChanges` the plate minted its tap with, so a save writes exactly what was approved.

const OWNER: ConsoleMember = { userId: "a0000000-0000-4000-8000-000000000001", email: "asha@trakline.in", name: "Asha Rao", role: "owner", status: "active" };
const REASON = "Maintenance window tonight, warning travellers";

function post(body: unknown, origin = "https://admin.trakline.in"): Request {
  return new Request("https://admin.trakline.in/api/settings/notice", { method: "POST", headers: { "content-type": "application/json", host: "admin.trakline.in", origin }, body: JSON.stringify(body) });
}

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(OWNER);
  saveSettings.mockClear();
});

describe("POST /api/settings/notice", () => {
  it("saves the notice on, with its text and the next version, against this deployment", async () => {
    const response = await POST(post({ on: true, text: "Back at 15:00 IST.", noticeVersion: 1, version: 7, reason: REASON }));
    expect(response.status).toBe(200);
    expect(saveSettings).toHaveBeenCalledWith({ site_notice_on: true, site_notice_text: "Back at 15:00 IST.", site_notice_version: 2 }, 7, REASON, "production");
  });

  it("turns it off touching nothing else", async () => {
    await POST(post({ on: false, text: "", noticeVersion: 2, version: 8, reason: REASON }));
    expect(saveSettings).toHaveBeenCalledWith({ site_notice_on: false }, 8, REASON, "production");
  });

  it("refuses an empty notice, a long one, and anything it did not ask for", async () => {
    for (const bad of [
      { on: true, text: " ", noticeVersion: 1, version: 7, reason: REASON },
      { on: true, text: "x".repeat(161), noticeVersion: 1, version: 7, reason: REASON },
      { on: true, text: "ok", noticeVersion: 1, version: 7, reason: REASON, environment: "preview" },
    ]) {
      expect((await POST(post(bad))).status).toBe(400);
    }
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("carries the Admin floor and the same-origin check", async () => {
    await POST(post({ on: false, text: "", noticeVersion: null, version: 1, reason: REASON }));
    expect(requireConsoleMember).toHaveBeenCalledWith("admin");
    expect((await POST(post({ on: false, text: "", noticeVersion: null, version: 1, reason: REASON }, "https://evil.example"))).status).toBe(403);
  });

  it("passes the console's own refusal through", async () => {
    saveSettings.mockRejectedValueOnce(new AppError("INVALID_INPUT", "The settings changed while this page was open.", { status: 409 }));
    expect((await POST(post({ on: false, text: "", noticeVersion: 1, version: 1, reason: REASON }))).status).toBe(409);
  });
});
