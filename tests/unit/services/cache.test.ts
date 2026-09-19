import { describe, expect, it } from "vitest";
import { MemoryCache } from "@/services/cache";

describe("MemoryCache", () => {
  it("answers within the ttl, asynchronously, so a shared store can stand in", async () => {
    let now = 1_000;
    const cache = new MemoryCache(() => now);
    await cache.set("k", "value", 60_000);
    now += 59_000;
    await expect(cache.get("k")).resolves.toBe("value");
  });

  it("forgets a value once its ttl has passed", async () => {
    let now = 0;
    const cache = new MemoryCache(() => now);
    await cache.set("k", 1, 1_000);
    now = 1_001;
    await expect(cache.get("k")).resolves.toBeUndefined();
  });

  it("forgets a deleted value at once", async () => {
    const cache = new MemoryCache(() => 0);
    await cache.set("k", 1, 1_000);
    await cache.delete("k");
    await expect(cache.get("k")).resolves.toBeUndefined();
  });
});
