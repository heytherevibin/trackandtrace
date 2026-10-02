import { describe, expect, it, vi } from "vitest";
import { ANNOUNCEMENT_CEILING, announcementBudget, takeAnnouncements } from "@/services/announcements/budget";
import { takeConfirmation } from "@/services/email/allowance";
import { MemoryKv } from "@/services/kv";

const HOUR_MS = 60 * 60 * 1000;

describe("the announcement budget", () => {
  it("is what is left under the ceiling", () => {
    expect(ANNOUNCEMENT_CEILING).toBe(40);
    expect(announcementBudget(0)).toBe(40);
    expect(announcementBudget(31)).toBe(9);
  });

  it("is zero, never negative, once the day is past the ceiling", () => {
    // Confirmations may take the day to 60. Announcements are squeezed first and send nothing,
    // which is a normal outcome rather than an error.
    expect(announcementBudget(40)).toBe(0);
    expect(announcementBudget(95)).toBe(0);
  });

  it("takes no more than the day leaves, and reports what it actually got", async () => {
    const kv = { incrBy: vi.fn(async () => 42), get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), ttl: vi.fn() };
    // 42 after the add means 32 were already spent, so 8 of the 10 asked for fit under the ceiling of 40.
    expect(await takeAnnouncements(kv as never, "t", new Date("2026-10-02T00:00:00Z"), 10)).toBe(8);
  });

  it("takes nothing when the counter cannot be read, because sending blind spends the operators' reserve", async () => {
    const kv = { incrBy: vi.fn(async () => { throw new Error("down"); }), get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), ttl: vi.fn() };
    expect(await takeAnnouncements(kv as never, "t", new Date(), 10)).toBe(0);
  });

  it("gives back what did not fit, so an over-ask leaves the counter exactly at the ceiling", async () => {
    // An un-refunded over-ask would silently eat the day's allowance, and nothing downstream reports it.
    const kv = new MemoryKv();
    const at = new Date("2026-10-02T06:00:00Z");
    await kv.incrBy("t:email:2026-10-02", HOUR_MS, 32);
    expect(await takeAnnouncements(kv, "t", at, 10)).toBe(8);
    expect(await kv.get("t:email:2026-10-02")).toBe("40");
  });

  it("gives the whole ask back when the day is already past the ceiling", async () => {
    const kv = new MemoryKv();
    const at = new Date("2026-10-02T06:00:00Z");
    await kv.incrBy("t:email:2026-10-02", HOUR_MS, 55);
    expect(await takeAnnouncements(kv, "t", at, 10)).toBe(0);
    expect(await kv.get("t:email:2026-10-02")).toBe("55");
  });

  it("counts what it takes on the counter confirmations use, so there is one ceiling of 100, not two", async () => {
    const kv = new MemoryKv();
    const at = new Date("2026-10-02T06:00:00Z");
    expect(await takeAnnouncements(kv, "t", at, 25)).toBe(25);
    expect(await takeConfirmation(kv, "t", at)).toBe("ok");
    expect(await kv.get("t:email:2026-10-02")).toBe("26");
    // Confirmations that fill the day to 40 leave announcements nothing: the intended order of sacrifice.
    for (let i = 0; i < 14; i += 1) await takeConfirmation(kv, "t", at);
    expect(await takeAnnouncements(kv, "t", at, 10)).toBe(0);
  });

  it("takes nothing, and leaves the counter alone, for an ask that is not a positive whole number", async () => {
    const kv = { incrBy: vi.fn(async () => 1), get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), ttl: vi.fn() };
    for (const want of [0, -3, 2.5, Number.NaN]) {
      expect(await takeAnnouncements(kv as never, "t", new Date(), want)).toBe(0);
    }
    expect(kv.incrBy).not.toHaveBeenCalled();
  });

  it("still reports what it reserved when the refund itself fails", async () => {
    const incrBy = vi.fn().mockResolvedValueOnce(42).mockRejectedValueOnce(new Error("down"));
    const kv = { incrBy, get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), ttl: vi.fn() };
    expect(await takeAnnouncements(kv as never, "t", new Date(), 10)).toBe(8);
  });
});
