import { describe, expect, it } from "vitest";
import { MemoryKv, type Kv } from "@/services/kv";
import { USAGE_TTL_MS, createUsageCounter, usageKey } from "@/services/usage";

// 20:00 UTC on the 18th is 01:30 on the 19th in India: counts follow the IST day.
const LATE_EVENING_UTC = new Date("2026-09-18T20:00:00.000Z");

describe("provider usage counters", () => {
  it("keys each provider's count by the day in India", () => {
    expect(usageKey("tt:test", "railkit", LATE_EVENING_UTC)).toBe("tt:test:usage:railkit:2026-09-19");
  });

  it("counts every request, and keeps the count for 40 days", async () => {
    const kv = new MemoryKv(() => LATE_EVENING_UTC.getTime());
    const count = createUsageCounter(kv, "tt:test", () => LATE_EVENING_UTC);
    await count("railkit");
    await count("railkit");
    // The counter is keyed by whatever provider name it is given. One provider is configured today,
    // so a second is named here to prove the keys stay apart when one lands.
    await count("second");
    await expect(kv.get("tt:test:usage:railkit:2026-09-19")).resolves.toBe("2");
    await expect(kv.get("tt:test:usage:second:2026-09-19")).resolves.toBe("1");
    await expect(kv.ttl("tt:test:usage:railkit:2026-09-19")).resolves.toBe(USAGE_TTL_MS);
    expect(USAGE_TTL_MS).toBe(40 * 24 * 60 * 60 * 1000);
  });

  it("never blocks a check when the store fails", async () => {
    const broken: Kv = {
      get: async () => null,
      set: async () => undefined,
      del: async () => undefined,
      ttl: async () => 0,
      incrBy: async () => {
        throw new Error("store down");
      },
      incr: async () => {
        throw new Error("store down");
      },
    };
    await expect(createUsageCounter(broken, "tt:test")("railkit")).resolves.toBeUndefined();
  });
});
