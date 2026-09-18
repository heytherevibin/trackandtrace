import { describe, expect, it } from "vitest";
import { MemoryCache } from "@/services/cache";
import { parseEnv } from "@/services/env";
import { EncryptedRedisCache } from "@/services/redis-cache";
import { createPnrCache } from "@/services/shared-store";

const DATA_KEY = Buffer.alloc(32, 7).toString("base64");

function envOf(source: Record<string, string>) {
  const parsed = parseEnv(source);
  if (!parsed.ok) throw new Error(parsed.issues.join());
  return parsed.env;
}

describe("createPnrCache", () => {
  it("uses this instance's memory without a shared store", () => {
    expect(createPnrCache(envOf({ NODE_ENV: "test" }))).toBeInstanceOf(MemoryCache);
  });

  it("uses the encrypted Redis cache when the shared store is configured", () => {
    const current = envOf({ NODE_ENV: "test", KV_REST_API_URL: "https://x.upstash.io", KV_REST_API_TOKEN: "t", DATA_KEY });
    expect(createPnrCache(current)).toBeInstanceOf(EncryptedRedisCache);
  });

  it("builds one store per environment, shared by the cache and the limiter", () => {
    const current = envOf({ NODE_ENV: "test", KV_REST_API_URL: "https://x.upstash.io", KV_REST_API_TOKEN: "t", DATA_KEY });
    expect(createPnrCache(current)).toBe(createPnrCache(current));
  });
});
