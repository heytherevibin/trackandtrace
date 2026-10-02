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
      { personId: "p1", claimedAt: hoursAgo(25) },
      { personId: "p2", claimedAt: hoursAgo(2) },
    ];
    expect(staleClaims(rows, AT)).toEqual(["p1"]);
  });

  it("leaves a row claimed inside the window alone, because the next run may still retry it", () => {
    expect(staleClaims([{ personId: "p1", claimedAt: hoursAgo(23) }], AT)).toEqual([]);
  });
});
