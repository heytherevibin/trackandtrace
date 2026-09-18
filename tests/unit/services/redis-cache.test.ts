import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveDataKeys } from "@/services/data-key";
import { EncryptedRedisCache } from "@/services/redis-cache";
import { createFakeUpstash } from "../../support/fake-upstash";

const fake = createFakeUpstash();
const keys = deriveDataKeys(Buffer.alloc(32, 7).toString("base64"));
const RECORD = { ok: true, pnr: "2345678901", train: "12951 Mumbai Rajdhani" };

function cache(onError = vi.fn(), k = keys) {
  return new EncryptedRedisCache({ redis: fake.redis, keys: k, namespace: "tt:test:pnr:v1", onError });
}

beforeEach(() => fake.reset());

describe("EncryptedRedisCache", () => {
  it("round-trips a value through Redis", async () => {
    await cache().set("2345678901", RECORD, 60_000);
    await expect(cache().get("2345678901")).resolves.toEqual(RECORD);
  });

  it("stores neither the PNR nor the record in the clear", async () => {
    await cache().set("2345678901", RECORD, 60_000);
    const held = fake.dump();
    expect(held).toMatch(/^tt:test:pnr:v1:[A-Za-z0-9_-]{43}=v1\./);
    expect(held).not.toContain("2345678901");
    expect(held).not.toContain("Rajdhani");
  });

  it("expires with the ttl", async () => {
    await cache().set("2345678901", RECORD, 60_000);
    fake.tick(60_001);
    await expect(cache().get("2345678901")).resolves.toBeUndefined();
  });

  it("misses when a value was moved under another key", async () => {
    await cache().set("2345678901", RECORD, 60_000);
    await cache().set("2345678902", { other: true }, 60_000);
    const [first, second] = fake.entries();
    fake.put(second[0], first[1]);
    await expect(cache().get("2345678902")).resolves.toBeUndefined();
  });

  it("misses after DATA_KEY rotates", async () => {
    await cache().set("2345678901", RECORD, 60_000);
    const rotated = deriveDataKeys(Buffer.alloc(32, 8).toString("base64"));
    await expect(cache(vi.fn(), rotated).get("2345678901")).resolves.toBeUndefined();
  });

  it("misses, never throws, while Redis is down, and reports it", async () => {
    const onError = vi.fn();
    fake.fail(true);
    await expect(cache(onError).get("2345678901")).resolves.toBeUndefined();
    await expect(cache(onError).set("2345678901", RECORD, 60_000)).resolves.toBeUndefined();
    await expect(cache(onError).delete("2345678901")).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it("deletes", async () => {
    await cache().set("2345678901", RECORD, 60_000);
    await cache().delete("2345678901");
    await expect(cache().get("2345678901")).resolves.toBeUndefined();
  });
});
