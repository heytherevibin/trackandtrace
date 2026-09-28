import { describe, expect, it, vi } from "vitest";
import { COPY_FRESH_MS, READ_TIMEOUT_MS, createRuntimeSettings } from "@/services/runtime-settings";

// ---------------------------------------------------------------------------
// The console's runtime settings, read on the traveller path.
//
// Design §F sets the waterfall, and each step exists because the one after it is
// worse: an in-process copy fresh for 5 seconds, then one Postgres read with an
// 800 ms timeout, then the LAST GOOD value, then the deployment's defaults.
//
// The rule underneath all four: **a check must keep answering.** §5 puts it as
// "Settings unreadable | Last good value, then the deployment's defaults; checks
// keep answering". A settings store that cannot be read is an inconvenience; a
// settings store that stops PNR checks is an outage this module caused.
//
// Each field is validated on its own, so one bad column cannot take the others
// down with it.
// ---------------------------------------------------------------------------

/** A clock the test moves by hand, because "wait five seconds" is not a test. */
function clock(start = 1_000_000) {
  let at = start;
  return { now: () => at, advance: (ms: number) => (at += ms) };
}

describe("createRuntimeSettings", () => {
  it("reads the console's value when the store answers", async () => {
    const settings = createRuntimeSettings({ read: async () => ({ live_checks_per_day: 900 }), now: clock().now });

    expect(await settings.liveChecksPerDay(300)).toBe(900);
  });

  it("falls back to the deployment's default when the column is null, which is what null MEANS here", async () => {
    // Every switch is nullable and null always means "the deployment's default".
    // It is not "zero" and not "off": the console has simply not taken this one over.
    const settings = createRuntimeSettings({ read: async () => ({ live_checks_per_day: null }), now: clock().now });

    expect(await settings.liveChecksPerDay(300)).toBe(300);
  });

  it("serves the in-process copy without asking the store again inside the freshness window", async () => {
    const read = vi.fn(async () => ({ live_checks_per_day: 900 }));
    const time = clock();
    const settings = createRuntimeSettings({ read, now: time.now });

    await settings.liveChecksPerDay(300);
    time.advance(COPY_FRESH_MS - 1);
    await settings.liveChecksPerDay(300);

    expect(read).toHaveBeenCalledTimes(1);
  });

  it("asks again once the copy is stale, so a change reaches every server", async () => {
    const read = vi.fn(async () => ({ live_checks_per_day: 900 }));
    const time = clock();
    const settings = createRuntimeSettings({ read, now: time.now });

    await settings.liveChecksPerDay(300);
    time.advance(COPY_FRESH_MS);
    await settings.liveChecksPerDay(300);

    expect(read).toHaveBeenCalledTimes(2);
  });

  it("serves the LAST GOOD value when a later read fails, rather than snapping back to the default", async () => {
    // The whole point of holding one. A store that blinks must not silently
    // restore a limit the console deliberately changed.
    const time = clock();
    let answer: () => Promise<unknown> = async () => ({ live_checks_per_day: 900 });
    const settings = createRuntimeSettings({ read: () => answer(), now: time.now });

    expect(await settings.liveChecksPerDay(300)).toBe(900);
    answer = async () => {
      throw new Error("the store is unreachable");
    };
    time.advance(COPY_FRESH_MS);

    expect(await settings.liveChecksPerDay(300)).toBe(900);
  });

  it("serves the deployment's default when the store has never answered", async () => {
    const settings = createRuntimeSettings({
      read: async () => {
        throw new Error("the store is unreachable");
      },
      now: clock().now,
    });

    expect(await settings.liveChecksPerDay(300)).toBe(300);
  });

  it("gives up on a slow read at the timeout and answers anyway", async () => {
    // A read that never returns must not become a check that never returns.
    const time = clock();
    const settings = createRuntimeSettings({
      read: () => new Promise(() => {}),
      now: time.now,
      wait: async (ms) => {
        expect(ms).toBe(READ_TIMEOUT_MS);
      },
    });

    expect(await settings.liveChecksPerDay(300)).toBe(300);
  });

  it("validates the field on its own, so one bad column does not poison the read", async () => {
    // The column's own check constraint is 1..1,000,000. A value outside it can
    // only mean the row was written by something that is not the console, and a
    // limit of zero would stop every check on the site.
    for (const bad of [0, -5, 2_000_000, 1.5, Number.NaN, "900", null]) {
      const settings = createRuntimeSettings({ read: async () => ({ live_checks_per_day: bad }), now: clock().now });

      expect(await settings.liveChecksPerDay(300), String(bad)).toBe(300);
    }
  });

  it("survives a store that answers with something that is not a row at all", async () => {
    for (const shape of [null, undefined, 42, "settings", []]) {
      const settings = createRuntimeSettings({ read: async () => shape, now: clock().now });

      expect(await settings.liveChecksPerDay(300), String(shape)).toBe(300);
    }
  });

  it("never throws into its caller, whatever the store does", async () => {
    const settings = createRuntimeSettings({
      read: () => {
        throw new Error("thrown synchronously, before any promise exists");
      },
      now: clock().now,
    });

    await expect(settings.liveChecksPerDay(300)).resolves.toBe(300);
  });
  it("does not ask again inside the window after a FAILED read either, so a broken store costs one attempt per window", async () => {
    // Without this the waterfall retries on every request: a settings store that
    // is down would add a read — and up to its whole 800 ms timeout — to every
    // traveller check, which is far worse than serving a five-second-old value.
    const read = vi.fn(async () => {
      throw new Error("the store is unreachable");
    });
    const time = clock();
    const settings = createRuntimeSettings({ read, now: time.now });

    await settings.liveChecksPerDay(300);
    await settings.liveChecksPerDay(300);
    time.advance(COPY_FRESH_MS - 1);
    await settings.liveChecksPerDay(300);

    expect(read).toHaveBeenCalledTimes(1);

    time.advance(1);
    await settings.liveChecksPerDay(300);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("keeps serving the last good value through a window in which the read failed", async () => {
    const time = clock();
    let answer: () => Promise<unknown> = async () => ({ live_checks_per_day: 900 });
    const settings = createRuntimeSettings({ read: () => answer(), now: time.now });

    await settings.liveChecksPerDay(300);
    answer = async () => {
      throw new Error("the store is unreachable");
    };
    time.advance(COPY_FRESH_MS);

    expect(await settings.liveChecksPerDay(300)).toBe(900);
    expect(await settings.liveChecksPerDay(300)).toBe(900);
  });
});

describe("siteNotice", () => {
  // The traveller strip reads this. Off is the deployment's default; there is no env value for it.
  const NOTICE = { site_notice_on: true, site_notice_text: "Planned maintenance on 21 Sep, 02:00–03:00 IST. Checks may be slow.", site_notice_version: 3 };

  it("answers the text and its version when the notice is on", async () => {
    const settings = createRuntimeSettings({ read: async () => NOTICE, now: clock().now });
    expect(await settings.siteNotice()).toEqual({ text: NOTICE.site_notice_text, version: 3 });
  });

  it("answers nothing when it is off, or null, or has no text to show", async () => {
    for (const row of [{ ...NOTICE, site_notice_on: false }, { ...NOTICE, site_notice_on: null }, { ...NOTICE, site_notice_text: null }, { ...NOTICE, site_notice_text: "   " }]) {
      const settings = createRuntimeSettings({ read: async () => row, now: clock().now });
      expect(await settings.siteNotice(), JSON.stringify(row)).toBeNull();
    }
  });

  it("treats a missing version as the first, so a device can still close it", async () => {
    const settings = createRuntimeSettings({ read: async () => ({ ...NOTICE, site_notice_version: null }), now: clock().now });
    expect(await settings.siteNotice()).toEqual({ text: NOTICE.site_notice_text, version: 1 });
  });

  it("refuses a text longer than the console allows rather than draw whatever arrived", async () => {
    const settings = createRuntimeSettings({ read: async () => ({ ...NOTICE, site_notice_text: "x".repeat(161) }), now: clock().now });
    expect(await settings.siteNotice()).toBeNull();
  });

  it("keeps showing the last good notice while the store is down", async () => {
    const time = clock();
    let fail = false;
    const settings = createRuntimeSettings({
      read: async () => {
        if (fail) throw new Error("down");
        return NOTICE;
      },
      now: time.now,
    });
    await settings.siteNotice();
    fail = true;
    time.advance(COPY_FRESH_MS + 1);
    expect(await settings.siteNotice()).toEqual({ text: NOTICE.site_notice_text, version: 3 });
  });

  it("does not let a bad notice column take the live-check limit down with it", async () => {
    const settings = createRuntimeSettings({ read: async () => ({ ...NOTICE, site_notice_version: "three", live_checks_per_day: 900 }), now: clock().now });
    expect(await settings.liveChecksPerDay(300)).toBe(900);
  });
});
