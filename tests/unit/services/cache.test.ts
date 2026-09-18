import { describe, expect, it, vi } from "vitest";
import { MemoryCache, getOrCompute } from "@/services/cache";

describe("getOrCompute", () => {
  it("misses, stores, then hits within the ttl", async () => {
    let now = 1_000;
    const cache = new MemoryCache(() => now);
    const compute = vi.fn(async () => "value");
    const first = await getOrCompute(cache, "k", 60_000, compute);
    const second = await getOrCompute(cache, "k", 60_000, compute);
    now += 59_000;
    const third = await getOrCompute(cache, "k", 60_000, compute);
    expect(first).toEqual({ value: "value", cached: false });
    expect(second.cached).toBe(true);
    expect(third.cached).toBe(true);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("recomputes after the ttl expires", async () => {
    let now = 0;
    const cache = new MemoryCache(() => now);
    const compute = vi.fn(async () => Math.random());
    await getOrCompute(cache, "k", 1_000, compute);
    now = 1_001;
    const later = await getOrCompute(cache, "k", 1_000, compute);
    expect(later.cached).toBe(false);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("does not store values the predicate rejects", async () => {
    const cache = new MemoryCache(() => 0);
    const compute = vi.fn(async () => ({ ok: false }));
    await getOrCompute(cache, "k", 1_000, compute, (v) => v.ok);
    await getOrCompute(cache, "k", 1_000, compute, (v) => v.ok);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("delete forces the next read to recompute", async () => {
    const cache = new MemoryCache(() => 0);
    const compute = vi.fn(async () => 1);
    await getOrCompute(cache, "k", 1_000, compute);
    await cache.delete("k");
    const again = await getOrCompute(cache, "k", 1_000, compute);
    expect(again.cached).toBe(false);
  });

  it("answers asynchronously, so a shared store can stand in", async () => {
    const cache = new MemoryCache(() => 0);
    await cache.set("k", 1, 1_000);
    await expect(cache.get("k")).resolves.toBe(1);
  });
});
