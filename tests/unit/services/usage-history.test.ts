import { describe, expect, it, vi } from "vitest";
import type { Kv } from "@/services/kv";
import { USAGE_TTL_MS, readUsageHistory, usageKey } from "@/services/usage";

// ---------------------------------------------------------------------------
// Reading back the daily provider counts the counter has been writing.
//
// Module 02 draws them two ways — a month's total against the plan, and a bar per
// day — and both come from the same keys `createUsageCounter` increments. Nothing
// new is recorded: this is the read that was never written.
//
// **A day with no key is a day with no requests, and that is a zero.** A day the
// store could not answer for is an absence. The two look identical in a bar chart
// unless the reader keeps them apart, and the sheet draws the second as a dashed
// "No data" box rather than a bar of height nothing.
// ---------------------------------------------------------------------------

function store(values: Readonly<Record<string, string>>, fail: readonly string[] = []): Kv {
  return {
    get: vi.fn(async (key: string) => {
      if (fail.includes(key)) throw new Error("the store could not answer");
      return values[key] ?? null;
    }),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    incrBy: vi.fn(),
    ttl: vi.fn(),
  } as unknown as Kv;
}

const AT = new Date("2026-09-27T12:00:00.000Z"); // 17:30 IST on the 27th
const PREFIX = "tt:production";

describe("readUsageHistory", () => {
  it("reads one day per key, newest last, in India's days", async () => {
    const kv = store({
      [usageKey(PREFIX, "railkit", new Date("2026-09-25T12:00:00.000Z"))]: "40",
      [usageKey(PREFIX, "railkit", new Date("2026-09-26T12:00:00.000Z"))]: "55",
      [usageKey(PREFIX, "railkit", new Date("2026-09-27T12:00:00.000Z"))]: "14",
    });

    const days = await readUsageHistory(kv, PREFIX, "railkit", 3, () => AT);

    expect(days).toEqual([
      { day: "2026-09-25", requests: 40 },
      { day: "2026-09-26", requests: 55 },
      { day: "2026-09-27", requests: 14 },
    ]);
  });

  it("reads a day with no key as zero, because no key means nothing was asked", async () => {
    const kv = store({ [usageKey(PREFIX, "railkit", AT)]: "14" });

    const days = await readUsageHistory(kv, PREFIX, "railkit", 2, () => AT);

    expect(days).toEqual([
      { day: "2026-09-26", requests: 0 },
      { day: "2026-09-27", requests: 14 },
    ]);
  });

  it("keeps a day the store could not answer for apart from a day of none", async () => {
    // The sheet draws this one as a dashed "No data" box, not a bar of height
    // nothing: "nobody asked" and "we cannot say" are different facts, and only
    // the first belongs in a total.
    const key = usageKey(PREFIX, "railkit", AT);
    const kv = store({}, [key]);

    const days = await readUsageHistory(kv, PREFIX, "railkit", 1, () => AT);

    expect(days).toEqual([{ day: "2026-09-27", requests: null }]);
  });

  it("refuses a stored value that is not a count, rather than drawing it", async () => {
    for (const bad of ["", "many", "-3", "1.5"]) {
      const kv = store({ [usageKey(PREFIX, "railkit", AT)]: bad });

      const days = await readUsageHistory(kv, PREFIX, "railkit", 1, () => AT);

      expect(days, bad).toEqual([{ day: "2026-09-27", requests: null }]);
    }
  });

  it("does not ask for more days than the counter keeps, because older keys have expired", async () => {
    // The counter writes with a 40-day TTL, so a 60-day window would read 20 days
    // of guaranteed absence and draw them as zeroes — a chart of a quiet month
    // that never happened.
    const kv = store({});
    const days = await readUsageHistory(kv, PREFIX, "railkit", 90, () => AT);

    expect(days).toHaveLength(Math.floor(USAGE_TTL_MS / 86_400_000));
  });
});
