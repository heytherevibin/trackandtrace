import { describe, expect, it } from "vitest";
import { nextBatch, staleClaims } from "../../../scripts/announce-plan.mjs";

const AT = new Date("2026-10-02T09:00:00.000Z");
const hoursAgo = (n: number) => new Date(AT.getTime() - n * 3_600_000).toISOString();

describe("nextBatch", () => {
  it("claims what the budget allows and no more", () => {
    expect(nextBatch({ budget: 7, pending: 40 })).toBe(7);
    expect(nextBatch({ budget: 40, pending: 3 })).toBe(3);
  });

  it("claims nothing when the day is spent, which is a normal outcome", () => {
    expect(nextBatch({ budget: 0, pending: 100 })).toBe(0);
  });
});

describe("staleClaims", () => {
  it("names rows claimed more than 24 hours ago, which can never be retried safely", () => {
    // Resend's idempotency window is 24 hours. Past it a repeat might duplicate, so the row is
    // marked unknown and left alone. Nothing else in the system will ever move it.
    const rows = [
      { personId: "p1", claimedAt: hoursAgo(25), firstAttemptedAt: hoursAgo(25) },
      { personId: "p2", claimedAt: hoursAgo(2), firstAttemptedAt: hoursAgo(2) },
    ];
    expect(staleClaims(rows, AT)).toEqual(["p1"]);
  });

  it("leaves a row claimed inside the window alone, because the next run may still retry it", () => {
    expect(staleClaims([{ personId: "p1", claimedAt: hoursAgo(23), firstAttemptedAt: hoursAgo(23) }], AT)).toEqual([]);
  });

  // The window is Resend's idempotency key's, and a key's age is counted from the FIRST attempt:
  // a re-claim moves `claimedAt` and does not give Resend its memory back.
  it("measures from the first attempt, so a row re-claimed three times is still stale at 25 hours", () => {
    const row = { personId: "p1", claimedAt: hoursAgo(0.5), firstAttemptedAt: hoursAgo(25) };
    expect(staleClaims([row], AT)).toEqual(["p1"]);
  });

  it("leaves a row first attempted 23 hours ago alone even though it was claimed 20 minutes ago", () => {
    const row = { personId: "p1", claimedAt: hoursAgo(1 / 3), firstAttemptedAt: hoursAgo(23) };
    expect(staleClaims([row], AT)).toEqual([]);
  });

  it("is stale at exactly 24 hours and not a millisecond before", () => {
    // A strictly daily cron lands exactly here. The claim stops re-claiming at 24 hours, so a row
    // that is not stale at 24 hours is stuck: neither retryable nor unknown, for a whole day.
    const exactly = { personId: "p1", claimedAt: hoursAgo(24), firstAttemptedAt: hoursAgo(24) };
    const justUnder = { personId: "p2", claimedAt: hoursAgo(24), firstAttemptedAt: new Date(AT.getTime() - 24 * 3_600_000 + 1).toISOString() };
    expect(staleClaims([exactly, justUnder], AT)).toEqual(["p1"]);
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["unreadable", "not a date"],
  ])("counts a first attempt that is %s as stale, because unknown is the side that never sends twice", (_name, firstAttemptedAt) => {
    expect(staleClaims([{ personId: "p1", claimedAt: hoursAgo(1), firstAttemptedAt }], AT)).toEqual(["p1"]);
  });
});
