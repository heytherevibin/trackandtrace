import { describe, expect, it } from "vitest";
import { connectRedis, upstashWindows, type RedisLike } from "@/services/upstash";

const credentials = { url: "https://fake.upstash.io", token: "fake-token" };

describe("the Upstash adapter", () => {
  it("builds a REST client without touching the network, usable wherever a RedisLike is", () => {
    const redis: RedisLike = connectRedis(credentials, 500);
    expect(typeof redis.get).toBe("function");
    expect(typeof redis.set).toBe("function");
    expect(typeof redis.del).toBe("function");
  });

  it("builds one sliding-window limiter per limit and window", () => {
    const windows = upstashWindows(connectRedis(credentials, 1000), "tt:test", 1000);
    expect(typeof windows(20, 60_000).limit).toBe("function");
  });
});
