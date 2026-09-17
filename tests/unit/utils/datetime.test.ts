import { describe, expect, it } from "vitest";
import { countdownTo, formatDate, formatDateTime, formatRelative, formatTime, parseJourneyDate } from "@/utils/datetime";

const ISO = "2026-09-17T08:30:00.000Z"; // 14:00 IST

describe("datetime (IST, en-IN)", () => {
  it("formats times in IST regardless of the host zone", () => {
    expect(formatTime(ISO)).toBe("14:00");
  });
  it("formats short and medium dates", () => {
    expect(formatDate(ISO, "short")).toMatch(/Thu.*17.*Sep/);
    expect(formatDate(ISO)).toMatch(/17.*Sep.*2026/);
    expect(formatDateTime(ISO)).toMatch(/17.*Sep.*2026.*14:00/);
  });
  it("formats relative time with a minute floor", () => {
    const now = new Date("2026-09-17T09:00:00.000Z");
    expect(formatRelative(ISO, now)).toMatch(/30 min/);
    expect(formatRelative("2026-09-17T08:59:40.000Z", now)).toMatch(/minute|now/);
    expect(formatRelative("2026-09-17T12:00:00.000Z", now)).toMatch(/3 hr|3 hours/);
  });
  it("counts down in hours and minutes and reports passed", () => {
    const now = new Date("2026-09-17T09:00:00.000Z");
    expect(countdownTo("2026-09-17T12:20:00.000Z", now)).toEqual({ state: "ahead", hours: 3, minutes: 20 });
    expect(countdownTo("2026-09-17T08:00:00.000Z", now).state).toBe("passed");
  });
  it("parses a journey date as an IST day", () => {
    expect(parseJourneyDate("2026-09-21").toISOString()).toBe("2026-09-20T18:30:00.000Z");
  });
});
