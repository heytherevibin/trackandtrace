import { describe, expect, it } from "vitest";
import { deriveDataKeys, keyedHash } from "@/services/data-key";

const DATA_KEY = Buffer.alloc(32, 7).toString("base64");

describe("deriveDataKeys", () => {
  it("derives three distinct 32-byte subkeys, the same every time", () => {
    const keys = deriveDataKeys(DATA_KEY);
    const all = [keys.cacheName, keys.cacheValue, keys.clientId];
    for (const key of all) expect(key.length).toBe(32);
    expect(new Set(all.map((k) => k.toString("hex"))).size).toBe(3);
    expect(deriveDataKeys(DATA_KEY).cacheName.equals(keys.cacheName)).toBe(true);
  });

  it("changes every subkey when DATA_KEY rotates", () => {
    const a = deriveDataKeys(DATA_KEY);
    const b = deriveDataKeys(Buffer.alloc(32, 8).toString("base64"));
    expect(a.cacheName.equals(b.cacheName) || a.cacheValue.equals(b.cacheValue) || a.clientId.equals(b.clientId)).toBe(false);
  });

  it("refuses a key that is not 32 bytes", () => {
    expect(() => deriveDataKeys(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("keyedHash", () => {
  it("is stable, url-safe, and hides its input", () => {
    const { clientId } = deriveDataKeys(DATA_KEY);
    const hash = keyedHash(clientId, "pnr:203.0.113.10");
    expect(hash).toBe(keyedHash(clientId, "pnr:203.0.113.10"));
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).not.toContain("203.0.113.10");
  });

  it("differs per key", () => {
    const { cacheName, clientId } = deriveDataKeys(DATA_KEY);
    expect(keyedHash(cacheName, "2345678901")).not.toBe(keyedHash(clientId, "2345678901"));
  });
});
