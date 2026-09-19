import { describe, expect, it, vi } from "vitest";
import { MemoryKv, redisKv, resilientKv, type Kv } from "@/services/kv";
import { createFakeUpstash } from "../../support/fake-upstash";

interface Harness {
  readonly kv: Kv;
  readonly tick: (ms: number) => void;
}

function memory(): Harness {
  const clock = { now: 1_000_000 };
  return { kv: new MemoryKv(() => clock.now), tick: (ms) => { clock.now += ms; } };
}

function redis(): Harness {
  const fake = createFakeUpstash();
  return { kv: redisKv(fake.redis), tick: (ms) => fake.tick(ms) };
}

describe.each([
  ["MemoryKv", memory],
  ["redisKv over Upstash", redis],
])("%s", (_name, make) => {
  it("sets, gets and deletes", async () => {
    const { kv } = make();
    await kv.set("a", "1", 10_000);
    await expect(kv.get("a")).resolves.toBe("1");
    await kv.del("a");
    await expect(kv.get("a")).resolves.toBeNull();
  });

  it("reports the time left, and 0 once a key is gone", async () => {
    const { kv, tick } = make();
    await kv.set("a", "1", 10_000);
    tick(4_000);
    await expect(kv.ttl("a")).resolves.toBe(6_000);
    tick(6_000);
    await expect(kv.ttl("a")).resolves.toBe(0);
    await expect(kv.get("a")).resolves.toBeNull();
    await expect(kv.ttl("never-set")).resolves.toBe(0);
  });

  it("counts from 1, setting the ttl only when the count starts", async () => {
    const { kv, tick } = make();
    await expect(kv.incr("n", 10_000)).resolves.toBe(1);
    tick(4_000);
    await expect(kv.incr("n", 10_000)).resolves.toBe(2);
    await expect(kv.ttl("n")).resolves.toBe(6_000);
    tick(6_000);
    await expect(kv.incr("n", 10_000)).resolves.toBe(1);
  });

  it("refreshes the ttl on every count when asked", async () => {
    const { kv, tick } = make();
    await kv.incr("n", 10_000, true);
    tick(4_000);
    await kv.incr("n", 10_000, true);
    await expect(kv.ttl("n")).resolves.toBe(10_000);
  });
});

describe("resilientKv", () => {
  it("answers from the fallback when the primary fails, and reports it", async () => {
    const fake = createFakeUpstash();
    const onError = vi.fn();
    const kv = resilientKv(redisKv(fake.redis), new MemoryKv(() => 0), onError);
    fake.fail(true);
    await kv.set("a", "1", 10_000);
    await expect(kv.get("a")).resolves.toBe("1");
    await expect(kv.incr("n", 10_000)).resolves.toBe(1);
    expect(onError).toHaveBeenCalled();
  });

  it("uses the primary while it answers", async () => {
    const fake = createFakeUpstash();
    const kv = resilientKv(redisKv(fake.redis), new MemoryKv(() => 0));
    await kv.set("a", "1", 10_000);
    expect(fake.dump()).toContain("a=1");
  });
});
