import { describe, expect, it } from "vitest";
import { NOTICE_MAX, noticeChanges, readNotice } from "@/console/settings/notice";
import { settingsTap } from "@/console/settings/settings-tap";

// ---------------------------------------------------------------------------
// The site notice switch. One pure function decides the changes a save sends, and
// the SAME function is used to mint the tap in the browser and to build the save on
// the server — so the two can never ask for different things.
//
// Turning it on, or changing its text, moves the version on: that is what makes a
// device that closed the old notice see the new one.
// ---------------------------------------------------------------------------

describe("noticeChanges", () => {
  it("turns it on with its text, and moves the version on", () => {
    expect(noticeChanges({ on: true, text: "  Planned maintenance tonight.  ", current: 3 })).toEqual({ site_notice_on: true, site_notice_text: "Planned maintenance tonight.", site_notice_version: 4 });
  });

  it("starts the version at 1 for a notice that has never had one", () => {
    expect(noticeChanges({ on: true, text: "First notice.", current: null })).toMatchObject({ site_notice_version: 1 });
  });

  it("turns it off and touches nothing else, so the text is still there next time", () => {
    expect(noticeChanges({ on: false, text: "ignored", current: 3 })).toEqual({ site_notice_on: false });
  });

  it("refuses an empty notice and one past 160 characters", () => {
    expect(() => noticeChanges({ on: true, text: "   ", current: 1 })).toThrow();
    expect(() => noticeChanges({ on: true, text: "x".repeat(NOTICE_MAX + 1), current: 1 })).toThrow();
  });

  it("mints a tap Postgres will re-digest identically", () => {
    expect(settingsTap("production", noticeChanges({ on: true, text: "Back at 15:00 IST.", current: 1 })).value).toBe(
      '{"site_notice_on": true, "site_notice_text": "Back at 15:00 IST.", "site_notice_version": 2}',
    );
  });
});

describe("readNotice", () => {
  it("reads what the console holds, on or off", () => {
    expect(readNotice({ site_notice_on: true, site_notice_text: "Hi", site_notice_version: 2 })).toEqual({ on: true, text: "Hi", version: 2 });
    expect(readNotice({ site_notice_on: false, site_notice_text: "Hi", site_notice_version: 2 })).toEqual({ on: false, text: "Hi", version: 2 });
  });

  it("reads a missing row or null columns as off, with nothing written yet", () => {
    expect(readNotice(null)).toEqual({ on: false, text: "", version: null });
    expect(readNotice({ site_notice_on: null, site_notice_text: null, site_notice_version: null })).toEqual({ on: false, text: "", version: null });
  });
});
